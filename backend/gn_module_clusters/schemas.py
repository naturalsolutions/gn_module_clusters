from geonature.utils.env import db

from marshmallow import ValidationError, validates_schema
from marshmallow_sqlalchemy import auto_field
from marshmallow_sqlalchemy.fields import Nested

from pypnusershub.schemas import UserSchema

from utils_flask_sqla.schema import SmartRelationshipsMixin
from utils_flask_sqla_geo.schema import GeoAlchemyAutoSchema, GeoModelConverter
from pypnnomenclature.utils import NomenclaturesConverter
from apptax.taxonomie.schemas import TaxrefSchema

from gn_module_clusters.models import Cluster


class ClusterConverter(NomenclaturesConverter, GeoModelConverter):
    pass


class ClusterSchema(SmartRelationshipsMixin, GeoAlchemyAutoSchema):
    class Meta:
        model = Cluster
        model_converter = ClusterConverter
        include_fk = True
        load_instance = True
        sqla_session = db.session
        feature_id = "id"
        feature_geometry = "geom_4326"

    id = auto_field(dump_only=True)  # should not be modified by update route!
    centroid = auto_field(dump_only=True)  # computed from geom
    manager = Nested(UserSchema, dump_only=True)
    taxon = Nested(TaxrefSchema, dump_only=True)

    @validates_schema
    def check_geom(self, data, **kwargs):
        if "geom" in data and "geom_4326" in data:
            raise ValidationError("Set geom or geom_4326, not both!")
