from marshmallow import Schema, fields


class ClustersConfigSchema(Schema):
    # List of allowed sources
    SOURCES = fields.List(fields.Int, load_default=[])
    # Limit of observations to display on initial load and on search
    OBSERVATIONS_LIMIT = fields.Integer(load_default=100)
