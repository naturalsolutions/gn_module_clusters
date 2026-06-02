from marshmallow import Schema, fields


class ClustersConfigSchema(Schema):
    # List of allowed sources
    SOURCES = fields.List(fields.Int, load_default=[])
    # Limit of observations to display on initial load and on search
    OBSERVATIONS_LIMIT = fields.Integer(load_default=100)
    # Module code of the module to redirect to when creating an observation
    CREATE_OBS_MODULE = fields.String(load_default=None)
    # Default filters applied on module load
    DEFAULT_FILTERS = fields.Dict(load_default={})
    # Enable Leaflet marker clustering on the observation map
    ENABLE_LEAFLET_CLUSTER = fields.Boolean(load_default=True)
