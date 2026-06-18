from datetime import datetime

from flask import Blueprint, request, g, jsonify, current_app, render_template
from flask_login import current_user
import sqlalchemy as sa
from sqlalchemy.orm import undefer
from utils_flask_sqla_geo.utils import geojsonify
from marshmallow import ValidationError
from werkzeug.exceptions import BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable
import requests

from geonature.utils.env import db
from geonature.core.gn_commons.models import TModules
from geonature.core.gn_meta.models import TDatasets
from geonature.core.gn_permissions.decorators import (
    check_cruved_scope,
    login_required,
    permissions_required,
)
from geonature.core.gn_permissions.tools import get_permissions, get_scope
from geonature.core.gn_synthese.models import Synthese
from geonature.core.gn_synthese.schemas import SyntheseSchema

from pypnnomenclature.models import BibNomenclaturesTypes, TNomenclatures
from pypnusershub.db.models import User
from pypnusershub.schemas import UserSchema
from apptax.taxonomie.models import TaxrefTree

import gn_module_clusters.admin  # noqa: F401

from gn_module_clusters import MODULE_CODE
from gn_module_clusters.models import (
    Cluster,
    Intervention,
    InterventionStatus,
    ObservarationCluster,
)
from gn_module_clusters.schemas import ClusterSchema, InterventionSchema, InterventionStatusSchema

blueprint: Blueprint = Blueprint(name="clusters", import_name=__name__, template_folder="templates")


@blueprint.record_once
def init(state):
    import sqlalchemy as sa

    from geonature.core.gn_synthese.models import VSyntheseForWebApp
    from geonature.core.gn_synthese.synthese_config import MANDATORY_COLUMNS

    MANDATORY_COLUMNS += [
        "id_nomenclature_valid_status",
        "validator",
        "validation_comment",
        "cluster_id",
    ]

    VSyntheseForWebApp.cluster_id = sa.orm.column_property(
        sa.select(ObservarationCluster.id_cluster)
        .where(ObservarationCluster.id_synthese == VSyntheseForWebApp.id_synthese)
        .scalar_subquery()
    )


def check_cluster_overlap(cluster):
    """Raise Conflict if another cluster with the same cd_nom overlaps the cluster geometry."""
    where_clauses = [
        Cluster.cd_nom == cluster.cd_nom,
        sa.func.ST_Intersects(Cluster.geom_4326, cluster.geom_4326),
    ]
    if cluster.id is not None:  # update case
        where_clauses += [Cluster.id != cluster.id]
    if db.session.scalar(sa.select(sa.exists().where(*where_clauses))):
        raise Conflict(
            "L’enprise géographique de ce foyer empiète sur un foyer voisin possédant le même cd_nom."
        )


def check_cluster_name(cluster):
    """Raise Conflict if another cluster with the same name already exists."""
    where_clauses = [Cluster.name == cluster.name]
    if cluster.id is not None:  # update case
        where_clauses += [Cluster.id != cluster.id]
    if db.session.scalar(sa.select(sa.exists().where(*where_clauses))):
        raise Conflict("Un foyer avec ce nom existe déjà.")


def dump(*args, as_geojson=None, only=[], **kwargs):
    if as_geojson is None:
        as_geojson = request.accept_mimetypes.best == "application/geo+json"
    only += ["manager", "taxref", "status", "yearly_state", "+cruved", "+interventions_count"]
    if request.args.get("observations_count"):
        only += ["+observations_count"]
    data = ClusterSchema(only=only, as_geojson=as_geojson).dump(*args, **kwargs)
    if as_geojson:
        return geojsonify(data)
    else:
        return jsonify(data)


rw_fields = [
    "manager_id",
    "status_id",
    "yearly_state_id",
    "name",
    "notes",
    "cd_nom",
    "geom_4326",
]


@blueprint.route(rule="/", methods=["GET"])
@login_required
def list_clusters():
    action_code = request.args.get("action", "R")
    scope = get_scope(
        action_code=action_code, module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS"
    )
    if scope == 0:
        raise Forbidden

    as_geojson = request.accept_mimetypes.best == "application/geo+json"
    stmt = sa.select(Cluster).where(Cluster.filter_by_scope(scope))

    accepted_cd_nom = request.args.get("accepted_cd_nom")
    if accepted_cd_nom:
        try:
            accepted_cd_nom = [int(x) for x in accepted_cd_nom.split(",")]
        except ValueError:
            raise BadRequest("accepted_cd_nom must be a comma-separated list of integers")
        accepted_trees = db.session.scalars(
            sa.select(TaxrefTree).where(TaxrefTree.cd_nom.in_(accepted_cd_nom))
        ).all()
        not_found_cd_nom = set(accepted_cd_nom) - set([tree.cd_nom for tree in accepted_trees])
        if not_found_cd_nom:
            raise BadRequest(
                f"Some cd_nom have not been found: {','.join(map(str, not_found_cd_nom))}"
            )
        stmt = stmt.join(TaxrefTree, TaxrefTree.cd_nom == Cluster.cd_nom).where(
            sa.and_(*[TaxrefTree.path.op("@>")(tree.path) for tree in accepted_trees])
        )

    if as_geojson:
        stmt = stmt.options(undefer(Cluster.geom_4326))
    clusters = db.session.scalars(stmt).all()
    return dump(clusters, many=True, as_geojson=as_geojson)


@blueprint.route(rule="/", methods=["POST"])
@check_cruved_scope(
    action="C", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def create_cluster(scope):
    as_geojson = request.content_type == "application/geo+json"
    create_schema = ClusterSchema(only=rw_fields, partial=["manager_id"], as_geojson=as_geojson)
    cluster = create_schema.load(request.json, session=db.session)

    # manager
    if cluster.manager_id is None:
        cluster.manager = g.current_user
    else:
        cluster.manager = db.get_or_404(User, cluster.manager_id)
        if not cluster.has_instance_permission(scope):
            raise Forbidden

    # nomenclatures
    if cluster.status_id is not None:
        cluster.status = db.session.scalars(
            sa.select(TNomenclatures).where(
                TNomenclatures.id_nomenclature == cluster.status_id,
                TNomenclatures.nomenclature_type.has(
                    BibNomenclaturesTypes.mnemonique == "CLUSTER_STATUS"
                ),
            )
        ).one_or_none()
        if not cluster.status:
            raise BadRequest(f"status nomenclature with id {cluster.status_id} not found")
    if cluster.yearly_state_id is not None:
        cluster.yearly_state = db.session.scalars(
            sa.select(TNomenclatures).where(
                TNomenclatures.id_nomenclature == cluster.yearly_state_id,
                TNomenclatures.nomenclature_type.has(
                    BibNomenclaturesTypes.mnemonique == "CLUSTER_YEARLY_STATE"
                ),
            )
        ).one_or_none()
        if not cluster.yearly_state:
            raise BadRequest(
                f"yearly state nomenclature with id {cluster.yearly_state_id} not found"
            )

    # When geoms are loaded from json, the srid is not necessary set
    if cluster.geom_4326.srid < 0:
        cluster.geom_4326.srid = 4326
    check_cluster_overlap(cluster)
    check_cluster_name(cluster)

    db.session.add(cluster)
    db.session.commit()
    return dump(cluster)


@blueprint.route(rule="/<int:id_cluster>", methods=["GET"])
@check_cruved_scope(
    action="R", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def get_cluster(id_cluster, scope):
    as_geojson = request.accept_mimetypes.best == "application/geo+json"
    stmt = (
        sa.select(Cluster)
        .where(Cluster.id == id_cluster)
        .options(undefer(Cluster.surface), undefer(Cluster.bbox))
    )
    if as_geojson:
        stmt = stmt.options(undefer(Cluster.geom_4326))
    cluster = db.session.execute(stmt).scalar_one_or_none()
    if not cluster:
        raise NotFound
    if not cluster.has_instance_permission(scope):
        raise Forbidden
    return dump(
        cluster,
        as_geojson=as_geojson,
        only=["+surface", "+bbox", "+notes", "+interventions", "+interventions.status"],
    )


@blueprint.route(rule="/<int:id_cluster>", methods=["POST"])
@check_cruved_scope(
    action="U", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def update_cluster(id_cluster, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound
    if not cluster.has_instance_permission(scope):
        raise Forbidden("You do not have access to this cluster.")

    as_geojson = request.content_type == "application/geo+json"
    update_schema = ClusterSchema(only=rw_fields, partial=True, as_geojson=as_geojson)

    # Avoid possible commits before the end of validation checks
    with db.session.no_autoflush:
        update_schema.load(request.json, instance=cluster)

        attrs = sa.inspect(cluster).attrs
        for attr in attrs:
            if not attr.history.has_changes():
                continue
            if attr.key == "geom_4326":
                if cluster.geom_4326.srid < 0:
                    cluster.geom_4326.srid = 4326
                check_cluster_overlap(cluster)
                # FIXME: check obs are still in cluster geom?
            elif attr.key == "name":
                check_cluster_name(cluster)
            elif attr.key == "manager_id":
                db.session.expire(cluster, ["manager"])
                if not cluster.manager:
                    raise BadRequest(f"manager with id {cluster.manager_id} not found")
                if not cluster.has_instance_permission(scope):
                    raise Forbidden(f"You are not allowed to set this manager (scope: {scope}).")
            elif attr.key == "status_id" and cluster.status_id is not None:
                db.session.expire(cluster, ["status"])
                if (
                    not cluster.status
                    or cluster.status.nomenclature_type.mnemonique != "CLUSTER_STATUS"
                ):
                    raise BadRequest(
                        f"yearly state nomenclature with id {cluster.status_id} not found"
                    )
            elif attr.key == "yearly_state_id" and cluster.yearly_state_id is not None:
                db.session.expire(cluster, ["yearly_state"])
                if (
                    not cluster.yearly_state
                    or cluster.yearly_state.nomenclature_type.mnemonique != "CLUSTER_YEARLY_STATE"
                ):
                    raise BadRequest(
                        f"yearly state nomenclature with id {cluster.yearly_state_id} not found"
                    )
            elif attr.key == "cd_nom":
                db.session.expire(cluster, ["taxref"])
                if not cluster.taxref:
                    raise BadRequest(f"taxon with cd_nom {cluster.cd_nom} not found")

                tree_path = cluster.taxref.tree.path
                # Obs in the cluster, but not in the cluster tree path!
                bad_obs_stmt = (
                    sa.select(Synthese.id_synthese)
                    .join(
                        ObservarationCluster,
                        Synthese.id_synthese == ObservarationCluster.id_synthese,
                    )
                    .join(
                        TaxrefTree,
                        TaxrefTree.cd_nom == Synthese.cd_nom,
                    )
                    .where(
                        ObservarationCluster.id_cluster == cluster.id,
                        sa.not_(TaxrefTree.path.op("<@")(tree_path)),
                    )
                )
                if db.session.scalar(sa.select(bad_obs_stmt.exists())):
                    raise BadRequest(
                        f"Some observations in this cluster have a cd_nom that is not in the new taxon tree ({cluster.cd_nom})."
                    )

                check_cluster_overlap(cluster)

    db.session.commit()
    return dump(cluster)


@blueprint.route(rule="/<int:id_cluster>", methods=["DELETE"])
@check_cruved_scope(
    action="D", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def delete_cluster(id_cluster, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound
    if not cluster.has_instance_permission(scope):
        raise Forbidden
    if db.session.scalar(
        sa.select(sa.exists().where(ObservarationCluster.id_cluster == cluster.id))
    ):
        raise Conflict("The cluster contains observations")
    db.session.delete(cluster)
    db.session.commit()
    return "", 204


@blueprint.route(rule="/observations", methods=["POST"])
@permissions_required(action="U", module_code=MODULE_CODE, object_code="CLUSTERS_OBSERVATIONS")
def list_observations(permissions):
    # This is the synthese route, decorated with @permissions_required(module_code="SYNTHESE", …)
    view_function = current_app.view_functions["gn_synthese.synthese.get_observations_for_web"]
    # This is the synthese route, without the @permissions_required decorator
    unprotected_view_function = view_function.__wrapped__
    # We call it directly, with our own set of permissions
    return unprotected_view_function(permissions=permissions)


@blueprint.route(rule="/roles", methods=["POST"])
@check_cruved_scope(
    action="U", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def list_roles(scope):
    # Return roles that the current_user can set as manager on its clusters
    # Please make sure this function is consistant with Cluster.filter_by_scope / Cluster.has_instance_permission
    if scope == 0:
        raise Forbidden
    if scope in [1, 2]:
        ors = []  # available managers
        if blueprint.config["MANAGER_ENABLE_USER"]:
            ors.append(User.id_role == current_user.id_role)
        # Groups of the curren_user:
        groups_ands = [
            User.groupe.is_(True),
            User.members.any(User.id_role == current_user.id_role),
        ]
        if blueprint.config["MANAGER_EXCLUDED_GROUPS_IDS"]:
            groups_ands.append(
                sa.not_(User.id_role.in_(blueprint.config["MANAGER_EXCLUDED_GROUPS_IDS"]))
            )
        ors.append(sa.and_(*groups_ands))
        if scope == 2 and current_user.id_organisme is not None:
            ors.append(User.id_organisme == current_user.id_organisme)
        where_clause = sa.or_(*ors)
    elif scope == 3:
        where_clause = sa.true()
    users = db.session.scalars(sa.select(User).where(where_clause)).all()
    return UserSchema().dump(users, many=True)


@blueprint.route(rule="/<int:id_cluster>/observations/<int:id_observation>", methods=["POST"])
@check_cruved_scope(
    action="U", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def cluster_add_observation(id_cluster, id_observation, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound("Cluster not found")
    if not cluster.has_instance_permission(scope):
        raise Forbidden("You have no rights on this cluster")
    obs_permissions = get_permissions(
        action_code="U",
        module_code=MODULE_CODE,
        object_code="CLUSTERS_OBSERVATIONS",
    )
    if not obs_permissions:
        raise Forbidden("You have no rights on any observations")
    obs = db.session.execute(
        sa.select(Synthese).where(Synthese.id_synthese == id_observation)
    ).scalar_one_or_none()
    if not obs:
        raise NotFound("Observation not found")
    if not obs.has_instance_permission(obs_permissions):
        raise Forbidden("You have no rights on this observation")
    if blueprint.config["SOURCES"] and obs.id_source not in blueprint.config["SOURCES"]:
        raise Forbidden("This observations does not come from an allowed source")
    if (
        blueprint.config["VERIFY_OBS_JDD"]
        and obs.id_dataset is not None
        and not db.session.scalar(
            sa.select(TDatasets.modules.any(TModules.module_code == MODULE_CODE)).where(
                TDatasets.id_dataset == obs.id_dataset
            )
        )
    ):
        raise Forbidden("Observation dataset is not associated to this module")
    if blueprint.config["VALID_STATUS"]:
        if obs.nomenclature_valid_status.cd_nomenclature not in blueprint.config["VALID_STATUS"]:
            raise BadRequest(
                f"Le statut de validation de l'observation ({obs.nomenclature_valid_status.mnemonique}) n’est pas suffisant pour l’associer à un foyer."
            )
    if not obs.taxref.tree <= cluster.taxref.tree:
        raise BadRequest("Le taxon de cette observation ne peut pas être ajouté à ce foyer.")
    if obs.cluster and not obs.cluster.has_instance_permission(scope):
        raise Forbidden(
            "Observation already associated to a cluster on which you do not have rights"
        )
    # FIXME: checks geometry (obs geom in cluster geom)?
    obs.cluster = cluster
    db.session.commit()
    return "", 204


@blueprint.route(rule="/<int:id_cluster>/observations/<int:id_observation>", methods=["DELETE"])
@check_cruved_scope(
    action="U", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def cluster_remove_observation(id_cluster, id_observation, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound("Cluster not found")
    if not cluster.has_instance_permission(scope):
        raise Forbidden("You have no rights on any observations")
    obs_permissions = get_permissions(
        action_code="U",
        module_code=MODULE_CODE,
        object_code="CLUSTERS_OBSERVATIONS",
    )
    if not obs_permissions:
        raise Forbidden("You have no rights on any observations")
    obs = db.session.execute(
        sa.select(Synthese).where(Synthese.id_synthese == id_observation)
    ).scalar_one_or_none()
    if not obs:
        raise NotFound("Observation not found")
    if not obs.has_instance_permission(obs_permissions):
        raise Forbidden("You have no rights on this observation")
    if obs.cluster != cluster:
        raise BadRequest("This observation does not belongs to this cluster")
    obs.associated_cluster = None
    db.session.commit()
    return "", 204


@blueprint.route(rule="/intervention-status", methods=["GET"])
@login_required
def list_intervention_status():
    """
    Return the list of intervention status.
    If a cd_nom is provided, filter the list with status valid for this cd_nom.
    A status is valid for a cd_nom if the status cd_nom is a parent.
    """
    stmt = sa.select(InterventionStatus).order_by(InterventionStatus.label)
    cd_nom = request.args.get("cd_nom", type=int)
    if cd_nom:
        given_tree = db.session.get(TaxrefTree, cd_nom)
        if not given_tree:
            raise BadRequest(f"cd_nom {cd_nom} not found")
        stmt = stmt.outerjoin(TaxrefTree, TaxrefTree.cd_nom == InterventionStatus.cd_nom).where(
            sa.or_(
                TaxrefTree.path.op("@>")(given_tree.path),
                InterventionStatus.cd_nom.is_(None),
            )
        )
    statuses = db.session.scalars(stmt).all()
    return jsonify(InterventionStatusSchema(many=True).dump(statuses))


@blueprint.route(rule="/<int:id_cluster>/interventions/", methods=["POST"])
@check_cruved_scope(
    action="U", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def cluster_create_intervention(id_cluster, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound("Cluster not found")
    if not cluster.has_instance_permission(scope):
        raise Forbidden("You have no rights on this cluster")

    schema = InterventionSchema(
        only=(
            "operator_id",
            "operator_name",
            "intervention_date",
            "status_id",
            "status_custom",
            "notes",
        ),
        load_instance=True,
        session=db.session,
    )
    try:
        intervention = schema.load(request.json)
    except ValidationError as e:
        raise BadRequest(e.messages)

    intervention.cluster = cluster
    intervention.requestor = g.current_user
    if intervention.intervention_date is None:
        intervention.intervention_date = sa.func.now()
    db.session.add(intervention)
    db.session.commit()
    return jsonify(InterventionSchema().dump(intervention))


@blueprint.route(rule="/<int:id_cluster>/interventions/<int:id_intervention>", methods=["POST"])
@check_cruved_scope(
    action="U", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def cluster_update_intervention(id_cluster, id_intervention, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound("Cluster not found")
    if not cluster.has_instance_permission(scope):
        raise Forbidden("You have no rights on this cluster")

    intervention = db.session.execute(
        sa.select(Intervention).where(
            Intervention.id == id_intervention, Intervention.cluster_id == id_cluster
        )
    ).scalar_one_or_none()
    if not intervention:
        raise NotFound("Intervention not found")

    schema = InterventionSchema(
        only=(
            "operator_id",
            "operator_name",
            "intervention_date",
            "status_id",
            "status_custom",
            "notes",
        ),
        load_instance=True,
        partial=True,
        session=db.session,
    )
    try:
        schema.load(request.json, instance=intervention)
    except ValidationError as e:
        raise BadRequest(e.messages)
    if request.json.get("status_id") is not None:
        intervention.status_custom = None
    if request.json.get("status_custom") is not None:
        intervention.status_id = None
    if request.json.get("operator_id") is not None:
        intervention.operator_name = None
    if request.json.get("operator_name") is not None:
        intervention.operator_id = None
    db.session.commit()
    return jsonify(InterventionSchema().dump(intervention))


@blueprint.route(rule="/<int:id_cluster>/interventions/<int:id_intervention>", methods=["DELETE"])
@check_cruved_scope(
    action="U", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def cluster_remove_intervention(id_cluster, id_intervention, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound("Cluster not found")
    if not cluster.has_instance_permission(scope):
        raise Forbidden("You have no rights on this cluster")

    intervention = db.session.execute(
        sa.select(Intervention).where(
            Intervention.id == id_intervention, Intervention.cluster_id == id_cluster
        )
    ).scalar_one_or_none()
    if not intervention:
        raise NotFound("Intervention not found")

    db.session.delete(intervention)
    db.session.commit()
    return "", 204


@blueprint.route(rule="/<int:id_cluster>/export_pdf", methods=["POST"])
@check_cruved_scope(
    action="E", module_code=MODULE_CODE, object_code="CLUSTERS_CLUSTERS", get_scope=True
)
def export_cluster_pdf(id_cluster, scope):
    cluster = db.session.execute(
        sa.select(Cluster)
        .where(Cluster.id == id_cluster)
        .options(
            undefer(Cluster.geom_4326), undefer(Cluster.geom), undefer(Cluster.surface)
        )  # FIXME:
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound
    if not cluster.has_instance_permission(scope):
        raise Forbidden

    filters = (request.json or {}).get("filters", {})

    obs_query = (
        sa.select(Synthese)
        .join(ObservarationCluster, ObservarationCluster.id_synthese == Synthese.id_synthese)
        .where(ObservarationCluster.id_cluster == id_cluster)
        .options(
            sa.orm.joinedload(Synthese.taxref),
            sa.orm.joinedload(Synthese.nomenclature_valid_status),
        )
    )

    # FIXME: use synthese filters?
    if filters.get("date_min"):
        obs_query = obs_query.where(Synthese.date_min >= filters["date_min"])
    if filters.get("date_max"):
        obs_query = obs_query.where(Synthese.date_max <= filters["date_max"])
    if filters.get("id_nomenclature_valid_status"):
        obs_query = obs_query.where(
            Synthese.id_nomenclature_valid_status == filters["id_nomenclature_valid_status"]
        )

    obs_limit = blueprint.config.get("OBSERVATIONS_LIMIT_PDF", 500)
    obs_query = obs_query.order_by(Synthese.date_min.desc()).limit(obs_limit)
    observations = db.session.execute(obs_query).scalars().all()

    interventions = db.session.scalars(
        sa.select(Intervention)
        .where(Intervention.cluster_id == id_cluster)
        .options(sa.orm.joinedload(Intervention.requestor), sa.orm.joinedload(Intervention.status))
        .order_by(Intervention.intervention_date.desc())
    ).all()

    basemap = current_app.config["MAPCONFIG"]["BASEMAP"][0]  # FIXME: configurable basemap choice?
    tile_url = basemap.get("url") or basemap.get("layer")
    if tile_url.startswith("//"):
        tile_url = "https:" + tile_url

    html = render_template(
        "cluster_export.html",
        tile_url=tile_url,
        cluster_geojson=ClusterSchema(as_geojson=True).dump(cluster),
        obs_geojson=SyntheseSchema(as_geojson=True).dump(observations, many=True),
        cluster=cluster,
        observations=observations,
        interventions=interventions,
        export_date=datetime.now().strftime("%d/%m/%Y %H:%M"),
    )

    files = {"files": ("index.html", html.encode("utf-8"), "text/html")}
    data = {
        "waitForSelector": ".leaflet-tile-loaded",
        "waitDelay": "0.5s",
        "marginTop": "1.5cm",
        "marginBottom": "1.5cm",
        "marginLeft": "1.5cm",
        "marginRight": "1.5cm",
        "printBackground": "true",
        "failOnConsoleExceptions": "true",
    }

    gotenberg_url = blueprint.config["GOTENBERG_URL"]
    resp = requests.post(
        f"{gotenberg_url}/forms/chromium/convert/html",
        files=files,
        data=data,
        timeout=30,
    )
    if not resp.ok:
        raise ServiceUnavailable(f"Gotenberg error ({resp.status_code}): {resp.text[:500]}")

    return current_app.response_class(resp.content, content_type="application/pdf")
