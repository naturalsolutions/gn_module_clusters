from calendar import c
from flask import g
from geoalchemy2 import Geometry
import sqlalchemy as sa
from sqlalchemy import Computed, event
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.orm import deferred, relationship

from geonature.utils.env import db
from geonature.core.gn_synthese.models import Synthese

from pypnusershub.db.models import User
from apptax.taxonomie.models import Taxref
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

    def has_instance_permission(self, scope, *, user=None):
        if user is None:
            user = g.current_user
        if scope == 0:
            return False
        elif scope == 1:
            return self.manager == user
        elif scope == 2:
            return self.manager == user or self.manager.id_organisme == user.id_organisme
        elif scope == 3:
            return True

    @classmethod
    def filter_by_scope(cls, scope, *, user=None):
        if user is None:
            user = g.current_user
        if scope == 0:
            return sa.false()
        elif scope == 1:
            return cls.manager_id == user.id_role
        elif scope == 2:
            return sa.or_(
                cls.manager_id == user.id_role,
                cls.manager_id.in_(
                    sa.select(User.id_role).where(User.id_organisme == user.id_organisme)
                ),
            )
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
        db.ForeignKey(Cluster.id),
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
