from geonature.utils.env import db
from geonature.utils.schema import CruvedSchemaMixin

from marshmallow import ValidationError, fields, validates_schema
from marshmallow_sqlalchemy import auto_field
from marshmallow_sqlalchemy.fields import Nested

from pypnusershub.schemas import UserSchema

from utils_flask_sqla.schema import SmartRelationshipsMixin
from utils_flask_sqla_geo.schema import GeoAlchemyAutoSchema, GeoModelConverter
from pypnnomenclature.utils import NomenclaturesConverter
from apptax.taxonomie.schemas import TaxrefSchema, TaxrefTreeSchema

from gn_module_clusters import MODULE_CODE
from gn_module_clusters.models import Cluster, Intervention, InterventionStatus

from geonature.core.gn_synthese.schemas import SyntheseSchema


class ClusterConverter(NomenclaturesConverter, GeoModelConverter):
    pass


class ClusterSchema(CruvedSchemaMixin, SmartRelationshipsMixin, GeoAlchemyAutoSchema):
    __module_code__ = MODULE_CODE
    __object_code__ = "CLUSTERS_CLUSTERS"

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
    taxref = Nested(TaxrefSchema, dump_only=True)
    observations_count = fields.Integer(dump_only=True)
    interventions_count = fields.Integer(dump_only=True)
    surface = fields.Float(dump_only=True)
    bbox = fields.String(dump_only=True)
    interventions = Nested("InterventionSchema", many=True, dump_only=True)
    observations = Nested(SyntheseSchema, many=True, dump_only=True)

    @validates_schema
    def check_geom(self, data, **kwargs):
        if "geom" in data and "geom_4326" in data:
            raise ValidationError("Set geom or geom_4326, not both!")


class InterventionStatusSchema(SmartRelationshipsMixin, GeoAlchemyAutoSchema):
    class Meta:
        model = InterventionStatus
        include_fk = True
        load_instance = True
        sqla_session = db.session

    id = auto_field(dump_only=True)
    taxref = Nested(TaxrefSchema, dump_only=True)
    tree = Nested(TaxrefTreeSchema, dump_only=True)


class InterventionSchema(SmartRelationshipsMixin, GeoAlchemyAutoSchema):
    class Meta:
        model = Intervention
        include_fk = True
        load_instance = True
        sqla_session = db.session

    id = auto_field(dump_only=True)
    cluster = Nested(ClusterSchema, dump_only=True)
    requestor = Nested(UserSchema, dump_only=True)
    operator = Nested(UserSchema, dump_only=True)
    status = Nested(InterventionStatusSchema, dump_only=True)

    @validates_schema
    def check_status_xor(self, data, **kwargs):
        if data.get("status_id") is not None and data.get("status_custom") is not None:
            raise ValidationError("Set status_id or status_custom, not both")

    @validates_schema
    def check_operator_xor(self, data, **kwargs):
        if data.get("operator_id") is not None and data.get("operator_name") is not None:
            raise ValidationError("Set operator_id or operator_name, not both")
