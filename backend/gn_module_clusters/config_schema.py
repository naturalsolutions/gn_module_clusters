from marshmallow import Schema, fields


class ClustersConfigSchema(Schema):
    # List of allowed sources, no restriction if empty
    SOURCES = fields.List(fields.Int, load_default=[])
    # Limit of observations to display on initial load and on search
    OBSERVATIONS_LIMIT = fields.Integer(load_default=100)
    # Module code of the module to redirect to when creating an observation
    CREATE_OBS_MODULE = fields.String(load_default=None)
    # Default filters applied on module load
    DEFAULT_FILTERS = fields.Dict(load_default={})
    # Max zoom level for Leaflet marker clustering on the observation map.
    # Clustering is active below this zoom; disabled at/above it.
    # Set to 0 or None to disable clustering entirely.
    LEAFLET_CLUSTER_MAX_ZOOM = fields.Integer(load_default=12, allow_none=True)
    # If True, verify that the observation dataset (JDD) is linked to this module
    VERIFY_OBS_JDD = fields.Boolean(load_default=True)
    # ID of a taxon list (bib_listes.id_liste) to restrict the taxon selector
    TAXON_LIST = fields.Integer(load_default=None, allow_none=True)
    # Max observations in PDF export
    OBSERVATIONS_LIMIT_PDF = fields.Integer(load_default=500)
    # Gotenberg service for HTML to PDF conversion
    GOTENBERG_URL = fields.String(load_default="http://localhost:3000")
