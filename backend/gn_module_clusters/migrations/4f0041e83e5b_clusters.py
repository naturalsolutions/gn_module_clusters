"""clusters

Revision ID: 4f0041e83e5b
Revises:
Create Date: 2024-09-30 17:13:44.650757

"""

from alembic import op
from gn_module_clusters import MODULE_CODE, SCHEMA
import sqlalchemy as sa
from geoalchemy2 import Geometry
from utils_flask_sqla.migrations.utils import logger

# revision identifiers, used by Alembic.
revision = "4f0041e83e5b"
down_revision = None
branch_labels = "clusters"
depends_on = ("707390c722fe",)  # FIXME: choose a suficient version (GN 2.15?)


def upgrade():
    conn = op.get_bind()
    metadata = sa.MetaData(bind=conn)
    module = sa.Table("t_modules", metadata, schema="gn_commons", autoload_with=conn)
    id_module = conn.execute(sa.select(module).where(module.c.module_code == MODULE_CODE)).scalar()

    logger.info(f"Create module schema {SCHEMA}")
    op.execute(f"CREATE SCHEMA {SCHEMA}")

    logger.info("Create nomenclature types for clusters")
    nomenclature_type = sa.Table(
        "bib_nomenclatures_types", metadata, schema="ref_nomenclatures", autoload_with=conn
    )
    id_clusters_status = conn.execute(
        sa.insert(nomenclature_type)
        .values(
            mnemonique="CLUSTER_STATUS",
            label_default="Statut du foyer",
            label_fr="Statut du foyer",
            definition_default="Statut du foyer de contamination",
            definition_fr="Statut du foyer de contamination",
            source="CLUSTERS",
            statut="Validé",
        )
        .returning(nomenclature_type.c.id_type)
    ).scalar_one()
    id_clusters_yearly_state = conn.execute(
        sa.insert(nomenclature_type)
        .values(
            mnemonique="CLUSTER_YEARLY_STATE",
            label_default="État de gestion annuel",
            label_fr="État de gestion annuel",
            definition_default="État de gestion annuel du foyer",
            definition_fr="État de gestion annuel du foyer",
            source="CLUSTERS",
            statut="Validé",
        )
        .returning(nomenclature_type.c.id_type)
    ).scalar_one()

    logger.info("Insert nomenclature values for clusters")
    nomenclature = sa.Table(
        "t_nomenclatures", metadata, schema="ref_nomenclatures", autoload_with=conn
    )
    op.execute(
        sa.insert(nomenclature).values(
            [
                {
                    "id_type": id_clusters_status,
                    "cd_nomenclature": "ACTIF",
                    "mnemonique": "ACTIF",
                    "label_default": "Actif",
                    "label_fr": "Actif",
                    "source": "CLUSTERS",
                    "statut": "Validé",
                    "active": True,
                },
                {
                    "id_type": id_clusters_status,
                    "cd_nomenclature": "INACTIF",
                    "mnemonique": "INACTIF",
                    "label_default": "Inactif",
                    "label_fr": "Inactif",
                    "source": "CLUSTERS",
                    "statut": "Validé",
                    "active": True,
                },
                {
                    "id_type": id_clusters_status,
                    "cd_nomenclature": "ERADICATED",
                    "mnemonique": "ERADICATED",
                    "label_default": "Éradiqué",
                    "label_fr": "Éradiqué",
                    "source": "CLUSTERS",
                    "statut": "Validé",
                    "active": True,
                },
                {
                    "id_type": id_clusters_yearly_state,
                    "cd_nomenclature": "TODO",
                    "mnemonique": "TODO",
                    "label_default": "À repasser",
                    "label_fr": "À repasser",
                    "source": "CLUSTERS",
                    "statut": "Validé",
                    "active": True,
                },
                {
                    "id_type": id_clusters_yearly_state,
                    "cd_nomenclature": "NOT_HANDLE",
                    "mnemonique": "NOT_HANDLE",
                    "label_default": "Non géré",
                    "label_fr": "Non géré",
                    "source": "CLUSTERS",
                    "statut": "Validé",
                    "active": True,
                },
                {
                    "id_type": id_clusters_yearly_state,
                    "cd_nomenclature": "HANDLE",
                    "mnemonique": "HANDLE",
                    "label_default": "Géré",
                    "label_fr": "Géré",
                    "source": "CLUSTERS",
                    "statut": "Validé",
                    "active": True,
                },
            ]
        )
    )

    logger.info("Create module tables")
    clusters = op.create_table(
        "t_clusters",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.Unicode, unique=True, nullable=False),
        sa.Column("notes", sa.UnicodeText),
        sa.Column("cd_nom", sa.Integer, sa.ForeignKey("taxonomie.taxref.cd_nom"), nullable=False),
        sa.Column("geom_4326", Geometry("GEOMETRY", srid=4326), nullable=False),
        sa.Column("geom", Geometry("GEOMETRY"), nullable=False),
        sa.Column(
            "centroid",
            Geometry("POINT"),
            sa.Computed("ST_Centroid(geom)", persisted=True),
        ),
        sa.Column(
            "status_id",
            sa.Integer,
            sa.ForeignKey("ref_nomenclatures.t_nomenclatures.id_nomenclature"),
        ),
        sa.Column(
            "yearly_state_id",
            sa.Integer,
            sa.ForeignKey("ref_nomenclatures.t_nomenclatures.id_nomenclature"),
        ),
        sa.Column(
            "manager_id",
            sa.Integer,
            sa.ForeignKey("utilisateurs.t_roles.id_role"),
            nullable=False,
        ),
        sa.Column("created_on", sa.DateTime, server_default=sa.func.now(), nullable=False),
        schema=SCHEMA,
    )
    logger.info("Add nomenclature type check constraints")
    op.execute(
        f"ALTER TABLE {SCHEMA}.t_clusters ADD CONSTRAINT check_clusters_status CHECK "
        "(ref_nomenclatures.check_nomenclature_type_by_mnemonique(status_id, 'CLUSTER_STATUS')) NOT VALID"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.t_clusters ADD CONSTRAINT check_clusters_yearly_state CHECK "
        "(ref_nomenclatures.check_nomenclature_type_by_mnemonique(yearly_state_id, 'CLUSTER_YEARLY_STATE')) NOT VALID"
    )
    op.create_table(
        "cor_synthese_cluster",
        sa.Column(
            "id_synthese",
            sa.Integer,
            sa.ForeignKey(
                "gn_synthese.synthese.id_synthese", onupdate="CASCADE", ondelete="CASCADE"
            ),
            primary_key=True,
        ),
        sa.Column(
            "id_cluster",
            sa.Integer,
            sa.ForeignKey(clusters.c.id, ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.UniqueConstraint("id_synthese", name="unique_id_synthese"),
        sa.Column("association_date", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column(
            "association_role_id",
            sa.Integer,
            sa.ForeignKey(column="utilisateurs.t_roles.id_role"),
            nullable=False,
        ),
        schema=SCHEMA,
    )

    # Permissions pour le module
    logger.info("Create module permissions")
    perm_object = sa.Table("t_objects", metadata, schema="gn_permissions", autoload_with=conn)
    id_object_all = conn.execute(
        sa.select(perm_object).where(perm_object.c.code_object == "ALL")
    ).scalar()
    action = sa.Table("bib_actions", metadata, schema="gn_permissions", autoload_with=conn)
    id_action_create = conn.execute(sa.select(action).where(action.c.code_action == "C")).scalar()
    id_action_read = conn.execute(sa.select(action).where(action.c.code_action == "R")).scalar()
    id_action_update = conn.execute(sa.select(action).where(action.c.code_action == "U")).scalar()
    id_action_delete = conn.execute(sa.select(action).where(action.c.code_action == "D")).scalar()
    permissions_available = sa.Table(
        "t_permissions_available", metadata, schema="gn_permissions", autoload_with=conn
    )
    op.execute(
        sa.insert(permissions_available).values(
            [
                {
                    "id_module": id_module,
                    "id_object": id_object_all,
                    "id_action": id_action_create,
                    "label": "Créer des foyers de contamination",
                    "scope_filter": True,
                },
                {
                    "id_module": id_module,
                    "id_object": id_object_all,
                    "id_action": id_action_read,
                    "label": "Voir les foyers de contamination",
                    "scope_filter": True,
                },
                {
                    "id_module": id_module,
                    "id_object": id_object_all,
                    "id_action": id_action_update,
                    "label": "Modifier des foyers de contamination",
                    "scope_filter": True,
                },
                {
                    "id_module": id_module,
                    "id_object": id_object_all,
                    "id_action": id_action_delete,
                    "label": "Supprimer des foyers de contamination",
                    "scope_filter": True,
                },
            ]
        )
    )

    logger.info("Create module notifications")
    # Catégories de notifications
    notification_category = sa.Table(
        "bib_notifications_categories",
        metadata,
        schema="gn_notifications",
        autoload_with=conn,
    )
    op.execute(
        sa.insert(notification_category).values(
            [
                {
                    "code": "CLUSTERS-CREATED",
                    "label": "Création d'un foyer de contamination",
                    "description": "Se déclenche lors de la création d'un nouveau foyer de contamination.",
                },
                {
                    "code": "CLUSTERS-VALIDATED",
                    "label": "Validation d'un foyer de contamination",
                    "description": "Se déclenche lors de la validation d'un foyer de contamination.",
                },
            ]
        )
    )

    # Modèles de notifications
    notification_template = sa.Table(
        "bib_notifications_templates",
        metadata,
        schema="gn_notifications",
        autoload_with=conn,
    )
    op.execute(
        sa.insert(notification_template).values(
            [
                {
                    "code_category": "CLUSTERS-CREATED",
                    "code_method": "DB",
                    "content": "Nouveau foyer de contamination créé",
                },
                {
                    "code_category": "CLUSTERS-CREATED",
                    "code_method": "EMAIL",
                    "content": "Nouveau foyer de contamination créé",
                },
                {
                    "code_category": "CLUSTERS-VALIDATED",
                    "code_method": "DB",
                    "content": "Votre foyer de contamination n°{{ cluster.id_cluster }} a été validé.",
                },
                {
                    "code_category": "CLUSTERS-VALIDATED",
                    "code_method": "EMAIL",
                    "content": "Votre foyer de contamination n°{{ cluster.id_cluster }} a été validé.",
                },
            ]
        )
    )


def downgrade():
    conn = op.get_bind()
    metadata = sa.MetaData(bind=conn)

    logger.info("Remove module notifications")
    notification_template = sa.Table(
        "bib_notifications_templates",
        metadata,
        schema="gn_notifications",
        autoload_with=conn,
    )
    op.execute(
        sa.delete(notification_template).where(
            notification_template.c.code_category.in_(["CLUSTERS-CREATED", "CLUSTERS-VALIDATED"])
        )
    )
    notification_category = sa.Table(
        "bib_notifications_categories",
        metadata,
        schema="gn_notifications",
        autoload_with=conn,
    )
    op.execute(
        sa.delete(notification_category).where(
            notification_category.c.code.in_(["CLUSTERS-CREATED", "CLUSTERS-VALIDATED"])
        )
    )

    logger.info("Remove module permissions")
    module = sa.Table("t_modules", metadata, schema="gn_commons", autoload_with=conn)
    id_module = conn.execute(sa.select(module).where(module.c.module_code == MODULE_CODE)).scalar()
    permissions_available = sa.Table(
        "t_permissions_available", metadata, schema="gn_permissions", autoload_with=conn
    )
    op.execute(
        sa.delete(permissions_available).where(permissions_available.c.id_module == id_module)
    )

    logger.info("Remove module tables")
    op.drop_table(table_name="cor_synthese_cluster", schema=SCHEMA)
    op.drop_table(table_name="t_clusters", schema=SCHEMA)

    logger.info("Remove nomenclature types")
    nomenclature = sa.Table(
        "t_nomenclatures", metadata, schema="ref_nomenclatures", autoload_with=conn
    )
    nomenclature_type = sa.Table(
        "bib_nomenclatures_types", metadata, schema="ref_nomenclatures", autoload_with=conn
    )
    op.execute(sa.delete(nomenclature).where(nomenclature.c.source == "CLUSTERS"))
    op.execute(sa.delete(nomenclature_type).where(nomenclature_type.c.source == "CLUSTERS"))

    logger.info(f"Remove module schema {SCHEMA}")
    op.execute(f"DROP SCHEMA {SCHEMA}")
