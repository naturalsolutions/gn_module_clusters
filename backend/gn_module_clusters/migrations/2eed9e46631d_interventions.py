"""interventions

Revision ID: 2eed9e46631d
Revises: 4f0041e83e5b
Create Date: 2026-06-15 07:28:55.812998

"""

from alembic import op
from gn_module_clusters import MODULE_CODE, SCHEMA
import sqlalchemy as sa
from utils_flask_sqla.migrations.utils import logger

# revision identifiers, used by Alembic.
revision = "2eed9e46631d"
down_revision = "4f0041e83e5b"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    metadata = sa.MetaData(bind=conn)

    logger.info("Create intervention status table")
    op.create_table(
        "t_intervention_status",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("cd_nom", sa.Integer, sa.ForeignKey("taxonomie.taxref.cd_nom"), nullable=True),
        schema=SCHEMA,
    )

    logger.info("Create intervention status permissions")
    module = sa.Table("t_modules", metadata, schema="gn_commons", autoload_with=conn)
    id_module = conn.execute(sa.select(module).where(module.c.module_code == MODULE_CODE)).scalar()
    perm_object = sa.Table("t_objects", metadata, schema="gn_permissions", autoload_with=conn)
    id_object_intervention_status = conn.execute(
        sa.insert(perm_object)
        .values(
            code_object="CLUSTERS_INTERVENTIONS_STATUS",
            label_object="Statuts d'intervention",
            description_object="Permission sur les statuts d'intervention.",
        )
        .returning(perm_object.c.id_object)
    ).scalar_one()
    object_module = sa.Table(
        "cor_object_module", metadata, schema="gn_permissions", autoload_with=conn
    )
    conn.execute(
        sa.insert(object_module).values(
            {"id_module": id_module, "id_object": id_object_intervention_status}
        )
    )
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
                    "id_object": id_object_intervention_status,
                    "id_action": id_action_create,
                    "label": "Créer un statut d'intervention",
                    "scope_filter": False,
                    "sensitivity_filter": False,
                    "areas_filter": False,
                    "taxons_filter": False,
                },
                {
                    "id_module": id_module,
                    "id_object": id_object_intervention_status,
                    "id_action": id_action_read,
                    "label": "Voir les statuts d'intervention",
                    "scope_filter": False,
                    "sensitivity_filter": False,
                    "areas_filter": False,
                    "taxons_filter": False,
                },
                {
                    "id_module": id_module,
                    "id_object": id_object_intervention_status,
                    "id_action": id_action_update,
                    "label": "Modifier un statut d'intervention",
                    "scope_filter": False,
                    "sensitivity_filter": False,
                    "areas_filter": False,
                    "taxons_filter": False,
                },
                {
                    "id_module": id_module,
                    "id_object": id_object_intervention_status,
                    "id_action": id_action_delete,
                    "label": "Supprimer un statut d'intervention",
                    "scope_filter": False,
                    "sensitivity_filter": False,
                    "areas_filter": False,
                    "taxons_filter": False,
                },
            ]
        )
    )

    logger.info("Create intervention table")
    op.create_table(
        "t_interventions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "cluster_id",
            sa.Integer,
            sa.ForeignKey(f"{SCHEMA}.t_clusters.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "requestor_id",
            sa.Integer,
            sa.ForeignKey("utilisateurs.t_roles.id_role"),
            nullable=False,
        ),
        sa.Column(
            "operator_id", sa.Integer, sa.ForeignKey("utilisateurs.t_roles.id_role"), nullable=True
        ),
        sa.Column("operator_name", sa.String(50)),
        sa.Column("request_date", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("intervention_date", sa.DateTime, nullable=False),
        sa.Column("status_id", sa.Integer, sa.ForeignKey(f"{SCHEMA}.t_intervention_status.id")),
        sa.Column("status_custom", sa.String(50)),
        sa.Column("notes", sa.UnicodeText),
        schema=SCHEMA,
    )
    op.create_check_constraint(
        "check_intervention_status_xor",
        "t_interventions",
        "(status_id IS NOT NULL AND status_custom IS NULL) OR (status_id IS NULL AND status_custom IS NOT NULL)",
        schema=SCHEMA,
    )
    op.create_check_constraint(
        "check_intervention_operator_xor",
        "t_interventions",
        "(operator_id IS NOT NULL AND operator_name IS NULL) OR (operator_id IS NULL AND operator_name IS NOT NULL)",
        schema=SCHEMA,
    )


def downgrade():
    conn = op.get_bind()
    metadata = sa.MetaData(bind=conn)

    logger.info("Remove intervention status permissions")
    permissions_available = sa.Table(
        "t_permissions_available", metadata, schema="gn_permissions", autoload_with=conn
    )
    perm_object = sa.Table("t_objects", metadata, schema="gn_permissions", autoload_with=conn)
    id_object = conn.execute(
        sa.select(perm_object.c.id_object).where(
            perm_object.c.code_object == "CLUSTERS_INTERVENTIONS_STATUS"
        )
    ).scalar()
    if id_object:
        op.execute(
            sa.delete(permissions_available).where(permissions_available.c.id_object == id_object)
        )
        op.execute(sa.delete(perm_object).where(perm_object.c.id_object == id_object))

    logger.info("Drop check constraints on intervention table")
    op.drop_constraint(
        "check_intervention_operator_xor", "t_interventions", type_="check", schema=SCHEMA
    )
    op.drop_constraint(
        "check_intervention_status_xor", "t_interventions", type_="check", schema=SCHEMA
    )
    logger.info("Remove intervention table")
    op.drop_table(table_name="t_interventions", schema=SCHEMA)
    logger.info("Remove intervention status table")
    op.drop_table(table_name="t_intervention_status", schema=SCHEMA)
