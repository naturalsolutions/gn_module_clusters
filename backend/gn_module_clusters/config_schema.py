from marshmallow import Schema, fields


class ClustersConfigSchema(Schema):
    # List of allowed sources
    SOURCES = fields.List(fields.Int, load_default=[])
