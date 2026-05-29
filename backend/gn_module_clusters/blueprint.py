from datetime import datetime
from flask import Blueprint, request, g, jsonify
from geoalchemy2.shape import from_shape
from geonature.core.gn_permissions.tools import get_permissions
from geonature.core.gn_synthese.models import Synthese
from pypnnomenclature.models import BibNomenclaturesTypes, TNomenclatures
from pypnusershub.db.models import User
from ref_geo.utils import get_local_srid
import sqlalchemy as sa
from sqlalchemy.orm import undefer
from utils_flask_sqla_geo.utils import geojsonify
from werkzeug.exceptions import BadRequest, Conflict, Forbidden, NotFound

from geonature.utils.env import db
from geonature.core.gn_permissions.decorators import check_cruved_scope

from gn_module_clusters import MODULE_CODE
from gn_module_clusters.models import Cluster, ObservarationCluster
from gn_module_clusters.schemas import ClusterSchema

blueprint: Blueprint = Blueprint(name="clusters", import_name=__name__)


def check_cluster_overlap(cluster):
    """Raise Conflict if another cluster with the same cd_nom overlaps the cluster geometry."""
    where_clauses = [
        Cluster.cd_nom == cluster.cd_nom,
        sa.func.ST_Intersects(Cluster.geom_4326, cluster.geom_4326),
    ]
    if cluster.id is not None:  # update case
        where_clauses += [Cluster.id != cluster.id]
    if db.session.scalar(sa.select(sa.exists().where(*where_clauses))):
        raise Conflict("A cluster with the same cd_nom already overlaps this geometry")


def dump(*args, as_geojson=None, **kwargs):
    if as_geojson is None:
        as_geojson = request.accept_mimetypes.best == "application/geo+json"
    data = ClusterSchema(
        only=["manager", "taxon", "status", "yearly_state"], as_geojson=as_geojson
    ).dump(*args, **kwargs)
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
@check_cruved_scope(action="R", module_code=MODULE_CODE, get_scope=True)
def list_clusters(scope):
    as_geojson = request.accept_mimetypes.best == "application/geo+json"
    stmt = sa.select(Cluster).where(Cluster.filter_by_scope(scope))
    if as_geojson:
        stmt = stmt.options(undefer(Cluster.geom_4326))
    clusters = db.session.scalars(stmt).all()
    return dump(clusters, many=True, as_geojson=as_geojson)


@blueprint.route(rule="/", methods=["POST"])
@check_cruved_scope(action="C", module_code=MODULE_CODE, get_scope=True)
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

    db.session.add(cluster)
    db.session.commit()
    return dump(cluster)


@blueprint.route(rule="/<int:id_cluster>", methods=["GET"])
@check_cruved_scope(action="R", module_code=MODULE_CODE, get_scope=True)
def get_cluster(id_cluster, scope):
    as_geojson = request.accept_mimetypes.best == "application/geo+json"
    stmt = sa.select(Cluster).where(Cluster.id == id_cluster)
    if as_geojson:
        stmt = stmt.options(undefer(Cluster.geom_4326))
    cluster = db.session.execute(stmt).scalar_one_or_none()
    if not cluster:
        raise NotFound
    if not cluster.has_instance_permission(scope):
        raise Forbidden
    return dump(cluster, as_geojson=as_geojson)


@blueprint.route(rule="/<int:id_cluster>", methods=["POST"])
@check_cruved_scope(action="U", module_code=MODULE_CODE, get_scope=True)
def update_cluster(id_cluster, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound
    if not cluster.has_instance_permission(scope):
        raise Forbidden

    as_geojson = request.content_type == "application/geo+json"
    update_schema = ClusterSchema(only=rw_fields, partial=True, as_geojson=as_geojson)

    # Avoid possible commits before the end of validation checks
    with db.session.no_autoflush:
        update_schema.load(request.json, instance=cluster)

        # When geoms are loaded from json, the srid is not necessary set
        if cluster.geom_4326.srid < 0:
            cluster.geom_4326.srid = 4326

        check_cluster_overlap(cluster)

        # refresh manager relationship in case FKs have been changed
        db.session.expire(cluster, ["manager", "status", "yearly_state"])

        # re-check permission in case the manager have been changed
        if not cluster.has_instance_permission(scope):
            raise Forbidden

        # re-check nomenclatures exists and are of proper type
        if cluster.status_id and (
            not cluster.status or cluster.status.nomenclature_type.mnemonique != "CLUSTER_STATUS"
        ):
            raise BadRequest(f"yearly state nomenclature with id {cluster.status_id} not found")
        if cluster.yearly_state_id and (
            not cluster.yearly_state
            or cluster.yearly_state.nomenclature_type.mnemonique != "CLUSTER_YEARLY_STATE"
        ):
            raise BadRequest(
                f"yearly state nomenclature with id {cluster.yearly_state_id} not found"
            )

        # FIXME: checks all obs are still in cluster taxref tree?
        # FIXME: checks geometry (cluster geom contains all cluster obs geoms)?

    db.session.commit()
    return dump(cluster)


@blueprint.route(rule="/<int:id_cluster>", methods=["DELETE"])
@check_cruved_scope(action="D", module_code=MODULE_CODE, get_scope=True)
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


@blueprint.route(rule="/<int:id_cluster>/observations/<int:id_observation>", methods=["POST"])
@check_cruved_scope(action="U", module_code=MODULE_CODE, get_scope=True)
def cluster_add_observation(id_cluster, id_observation, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound("Cluster not found")
    if not cluster.has_instance_permission(scope):
        raise Forbidden("You have no rights on this cluster")
    obs_permissions = get_permissions(
        action_code="R",
        module_code="SYNTHESE",
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
    if not obs.taxref.tree <= cluster.taxref.tree:
        raise BadRequest("Observation not in cluster taxon tree")
    if obs.cluster and not obs.cluster.has_instance_permission(scope):
        raise Forbidden(
            "Observation already associated to a cluster on which you do not have rights"
        )
    # FIXME: checks geometry (obs geom in cluster geom)?
    obs.cluster = cluster
    db.session.commit()
    return "", 204


@blueprint.route(rule="/<int:id_cluster>/observations/<int:id_observation>", methods=["DELETE"])
@check_cruved_scope(action="U", module_code=MODULE_CODE, get_scope=True)
def cluster_remove_observation(id_cluster, id_observation, scope):
    cluster = db.session.execute(
        sa.select(Cluster).where(Cluster.id == id_cluster)
    ).scalar_one_or_none()
    if not cluster:
        raise NotFound("Cluster not found")
    if not cluster.has_instance_permission(scope):
        raise Forbidden("You have no rights on any observations")
    obs_permissions = get_permissions(
        action_code="R",
        module_code="SYNTHESE",
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
