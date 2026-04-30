from geonature.utils.env import db

from marshmallow import EXCLUDE, ValidationError, validates_schema
from marshmallow.decorators import post_load
from marshmallow_sqlalchemy import auto_field
from marshmallow_sqlalchemy.fields import Nested

from pypnusershub.schemas import UserSchema

from ref_geo.utils import get_local_srid
from utils_flask_sqla.schema import SmartRelationshipsMixin
from utils_flask_sqla_geo.schema import GeoAlchemyAutoSchema

from gn_module_clusters.models import Cluster


class ClusterSchema(SmartRelationshipsMixin, GeoAlchemyAutoSchema):
    class Meta:
        model = Cluster
        include_fk = True
        load_instance = True
        sqla_session = db.session
        feature_id = "id"
        feature_geometry = "geom_4326"

    id = auto_field(dump_only=True)  # should not be modified by update route!
    centroid = auto_field(dump_only=True)  # computed from geom
    manager_id = auto_field(dump_only=True)  # manager set through relationship
    manager = Nested(UserSchema, unknown=EXCLUDE)

    @validates_schema
    def check_geom(self, data, **kwargs):
        if "geom" in data and "geom_4326" in data:
            raise ValidationError("Set geom or geom_4326, not both!")

    @post_load
    def set_srid(self, item, **kwargs):
        # When geoms are loaded from json, we do not known the srid, assume the srid of the column
        # - geom -> local srid
        # - geom_4326 -> 4326
        if item.geom is not None and item.geom.srid < 0:
            item.geom.srid = get_local_srid(db.session)
        if item.geom_4326 is not None and item.geom_4326.srid < 0:
            item.geom_4326.srid = 4326
        return item
