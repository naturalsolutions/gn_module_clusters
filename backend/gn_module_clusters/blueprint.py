from datetime import datetime
from flask import Blueprint, request, g, jsonify
from geonature.core.gn_permissions.tools import get_permissions
from geonature.core.gn_synthese.models import Synthese
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


def dump(*args, as_geojson=None, **kwargs):
    if as_geojson is None:
        as_geojson = request.accept_mimetypes.best == "application/geo+json"
    data = ClusterSchema(only=["manager"], as_geojson=as_geojson).dump(*args, **kwargs)
    if as_geojson:
        return geojsonify(data)
    else:
        return jsonify(data)


rw_fields = ["manager.id_role", "+geom", "+geom_4326"]
create_schema = ClusterSchema(only=rw_fields, partial=["geom", "geom_4326"])
update_schema = ClusterSchema(only=rw_fields, partial=True)


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
    # Using manager.id for loading the manager, allowing to check its organisme
    cluster = create_schema.load(request.json, session=db.session)
    if cluster.manager is None:
        cluster.manager = g.current_user
    if not cluster.has_instance_permission(scope):
        raise Forbidden
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
    # Avoid possible commits before the end of validation checks
    with db.session.no_autoflush:
        update_schema.load(request.json, instance=cluster)
        if not cluster.has_instance_permission(scope):  # the manager may have been modified
            raise Forbidden
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
