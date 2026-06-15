from flask_admin.contrib.sqla import ModelView

from geonature.utils.env import db
from geonature.core.admin.admin import admin as geonature_admin, CruvedProtectedMixin

from gn_module_clusters.models import InterventionStatus
from apptax.taxonomie.models import Taxref


class InterventionStatusView(CruvedProtectedMixin, ModelView):
    module_code = "CLUSTERS"
    object_code = "CLUSTERS_INTERVENTIONS_STATUS"

    can_view_details = True
    column_list = ("label", "taxref")
    column_searchable_list = ("label",)
    column_labels = {
        "label": "Libellé",
        "taxref": "Taxon",
    }
    form_columns = ("label", "taxref")
    form_ajax_refs = {
        "taxref": {
            "fields": ["nom_complet", "cd_nom", "nom_vern"],
            "page_size": 10,
        },
    }


geonature_admin.add_view(
    InterventionStatusView(
        InterventionStatus, db.session, name="Statuts d'intervention", category="Foyers"
    )
)
