from calendar import c
from flask import g
from geoalchemy2 import Geometry
import sqlalchemy as sa
from sqlalchemy import Computed, event
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import deferred, foreign, relationship, remote

from geonature.utils.env import db
from geonature.core.gn_synthese.models import Synthese

from pypnusershub.db.models import User
from apptax.taxonomie.models import Taxref, TaxrefTree
from ref_geo.utils import get_local_srid

from gn_module_clusters import SCHEMA
from pypnnomenclature.models import TNomenclatures


class Cluster(db.Model):
    __tablename__ = "t_clusters"
    __table_args__ = {"schema": SCHEMA}

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.Unicode, unique=True, nullable=False)
    notes = db.Column(db.UnicodeText)
    cd_nom = db.Column(db.Integer, db.ForeignKey(Taxref.cd_nom), nullable=False)
    taxref = db.relationship(Taxref)
    geom_4326 = deferred(db.Column(Geometry("GEOMETRY", srid=4326), nullable=False))
    geom = deferred(db.Column(Geometry("GEOMETRY"), nullable=False))
    centroid = deferred(
        db.Column(Geometry("POINT"), Computed("ST_Centroid(geom)", persisted=True), nullable=False)
    )
    status_id = db.Column(
        db.Integer, db.ForeignKey("ref_nomenclatures.t_nomenclatures.id_nomenclature")
    )
    status = db.relationship(TNomenclatures, foreign_keys=[status_id], uselist=False)
    yearly_state_id = db.Column(
        db.Integer, db.ForeignKey("ref_nomenclatures.t_nomenclatures.id_nomenclature")
    )
    yearly_state = db.relationship(TNomenclatures, foreign_keys=[yearly_state_id], uselist=False)
    manager_id = db.Column(db.Integer, db.ForeignKey(User.id_role), nullable=False)
    manager = db.relationship(User)
    created_on = db.Column(sa.DateTime, server_default=sa.func.now())

    surface = db.column_property(sa.func.ST_Area(geom), deferred=True)

    @hybrid_property
    def observations_count(self):
        return db.session.scalar(
            sa.select(sa.func.count()).where(ObservarationCluster.id_cluster == self.id)
        )

    @observations_count.expression
    def observations_count(cls):
        return (
            sa.select(sa.func.count())
            .where(ObservarationCluster.id_cluster == cls.id)
            .correlate(cls.__table__)
            .scalar_subquery()
        )

    @hybrid_property
    def interventions_count(self):
        return db.session.scalar(
            sa.select(sa.func.count()).where(Intervention.cluster_id == self.id)
        )

    @interventions_count.expression
    def interventions_count(cls):
        return (
            sa.select(sa.func.count())
            .where(Intervention.cluster_id == cls.id)
            .correlate(cls.__table__)
            .scalar_subquery()
        )

    def has_instance_permission(self, scope, *, user=None):
        if user is None:
            user = g.current_user
        if scope == 0:
            return False
        elif scope == 1:
            return self.manager == user or (self.manager.groupe and self.manager in user.groups)
        elif scope == 2:
            return (
                self.manager == user
                or (self.manager.id_organisme and self.manager.id_organisme == user.id_organisme)
                or (self.manager.groupe and self.manager in user.groups)
            )
        elif scope == 3:
            return True

    @classmethod
    def filter_by_scope(cls, scope, *, user=None):
        if user is None:
            user = g.current_user
        if scope == 0:
            return sa.false()
        elif scope in [1, 2]:
            ors = [
                cls.manager_id == user.id_role,
                cls.manager.has(
                    sa.and_(User.groupe.is_(True), User.members.any(User.id_role == user.id_role))
                ),
            ]
            if scope == 2 and user.id_organisme is not None:
                ors.append(cls.manager.has(User.id_organisme == user.id_organisme))
            return sa.or_(*ors)
        elif scope == 3:
            return sa.true()

    def __str__(self):
        return f"Cluster<{self.name}>"


class ObservarationCluster(db.Model):
    __table_args__ = {"schema": SCHEMA}
    __tablename__ = "cor_synthese_cluster"
    id_synthese = db.Column(
        db.Integer,
        db.ForeignKey(Synthese.id_synthese),
        primary_key=True,
    )
    observation = db.relationship(Synthese, back_populates="associated_cluster")
    id_cluster = db.Column(
        db.Integer,
        db.ForeignKey(Cluster.id, ondelete="CASCADE"),
        primary_key=True,
    )
    cluster = db.relationship(Cluster, back_populates="associated_observations")
    association_date = sa.Column(sa.DateTime, server_default=sa.func.now(), nullable=False)
    association_role_id = sa.Column(
        sa.Integer,
        sa.ForeignKey(column="utilisateurs.t_roles.id_role"),
        nullable=False,
    )
    association_role = db.relationship(User)
    db.UniqueConstraint("id_synthese", name="unique_id_synthese")


class InterventionStatus(db.Model):
    __tablename__ = "t_intervention_status"
    __table_args__ = {"schema": SCHEMA}

    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(50), nullable=False)
    cd_nom = db.Column(db.Integer, db.ForeignKey(Taxref.cd_nom), nullable=True)
    taxref = db.relationship(Taxref)
    tree = db.relationship(
        TaxrefTree,
        uselist=False,
        viewonly=True,
        primaryjoin=lambda: foreign(InterventionStatus.cd_nom) == remote(TaxrefTree.cd_nom),
    )


class Intervention(db.Model):
    __tablename__ = "t_interventions"
    __table_args__ = (
        db.CheckConstraint(
            "(status_id IS NOT NULL AND status_custom IS NULL) OR (status_id IS NULL AND status_custom IS NOT NULL)",
            name="check_intervention_status_xor",
        ),
        db.CheckConstraint(
            "(operator_id IS NOT NULL AND operator_name IS NULL) OR (operator_id IS NULL AND operator_name IS NOT NULL)",
            name="check_intervention_operator_xor",
        ),
        {"schema": SCHEMA},
    )

    id = db.Column(db.Integer, primary_key=True)
    cluster_id = db.Column(
        db.Integer, db.ForeignKey(Cluster.id, ondelete="CASCADE"), primary_key=True
    )
    cluster = db.relationship(
        Cluster, backref=db.backref("interventions", cascade="all, delete-orphan")
    )
    requestor_id = db.Column(db.Integer, db.ForeignKey(User.id_role), nullable=False)
    requestor = db.relationship(User, foreign_keys=[requestor_id])
    operator_id = db.Column(db.Integer, db.ForeignKey(User.id_role), nullable=True)
    operator = db.relationship(User, foreign_keys=[operator_id])
    operator_name = db.Column(db.String(50))
    request_date = db.Column(sa.DateTime, server_default=sa.func.now(), nullable=False)
    intervention_date = db.Column(sa.DateTime, nullable=False)
    status_id = db.Column(db.Integer, db.ForeignKey(InterventionStatus.id))
    status = db.relationship(InterventionStatus)
    status_custom = db.Column(db.String(50))
    notes = db.Column(db.UnicodeText)


Cluster.associated_observations = db.relationship(ObservarationCluster, back_populates="cluster")
Cluster.observations = association_proxy("associated_observations", "observation")
Synthese.associated_cluster = db.relationship(
    ObservarationCluster,
    uselist=False,
    back_populates="observation",
    cascade="all, delete-orphan",
    single_parent=True,
)
Synthese.cluster = association_proxy(
    "associated_cluster",
    "cluster",
    creator=lambda cluster: ObservarationCluster(cluster=cluster, association_role=g.current_user),
)


@event.listens_for(Cluster, "before_insert")
def set_geom(mapper, connection, target):
    if target.geom is None and target.geom_4326 is not None:
        target.geom = sa.func.ST_Transform(target.geom_4326, get_local_srid(db.session))


@event.listens_for(Cluster, "before_insert")
def set_geom_4326(mapper, connection, target):
    if target.geom_4326 is None and target.geom is not None:
        target.geom_4326 = sa.func.ST_Transform(target.geom, 4326)


@event.listens_for(Intervention, "before_insert")
def set_intervention_id(mapper, connection, target):
    if target.id is None:
        max_id = connection.execute(
            sa.select(sa.func.max(Intervention.id)).where(
                Intervention.cluster_id == target.cluster_id
            )
        ).scalar()
        target.id = (max_id or 0) + 1
