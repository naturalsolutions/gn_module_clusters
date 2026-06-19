from flask import g
from gn_module_clusters.config_schema import ClustersConfigSchema
import pytest
import sqlalchemy as sa

from geonature.utils.env import db

from pypnusershub.db.models import User
from ref_geo.models import BibAreasTypes, LAreas

from gn_module_clusters.models import Cluster


@pytest.fixture
def remove_existing_clusters(app):
    db.session.execute(sa.delete(Cluster))


@pytest.fixture
def clusters(users, synthese_data, remove_existing_clusters) -> dict[str, Cluster]:
    p1 = db.session.execute(
        sa.select(LAreas).where(
            LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
            LAreas.area_code == "85",
        )
    ).scalar_one()
    p2 = db.session.execute(
        sa.select(LAreas).where(
            LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
            LAreas.area_code == "69",
        )
    ).scalar_one()
    p3 = db.session.execute(
        sa.select(LAreas).where(
            LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
            LAreas.area_code == "31",
        )
    ).scalar_one()
    p4 = db.session.execute(
        sa.select(LAreas).where(
            LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
            LAreas.area_code == "30",
        )
    ).scalar_one()
    p5 = db.session.execute(
        sa.select(LAreas).where(
            LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
            LAreas.area_code == "62",
        )
    ).scalar_one()
    kwargs = {
        "cd_nom": synthese_data["obs2"].taxref.cd_sup,
    }
    cls: dict[str, Cluster] = {}
    with db.session.begin_nested():
        cls["c1"] = Cluster(name="Cluster 1", manager=users["self_user"], geom=p1.geom, **kwargs)
        db.session.add(cls["c1"])
        cls["c2"] = Cluster(
            name="Cluster 2", manager=users["associate_user"], geom=p2.geom, **kwargs
        )
        db.session.add(cls["c2"])
        cls["c3"] = Cluster(
            name="Cluster 3",
            manager=users["stranger_user"],
            geom=p3.geom,
            cd_nom=synthese_data["obs1"].cd_nom,
        )
        db.session.add(cls["c3"])
        cls["c4"] = Cluster(name="Cluster 4", manager=users["user"], geom=p4.geom, **kwargs)
        db.session.add(cls["c4"])
        cls["c5"] = Cluster(
            name="Cluster 5",
            manager=users["stranger_user"],
            geom=p5.geom,
            cd_nom=synthese_data["obs1"].cd_nom,
        )
        db.session.add(cls["c5"])

    g.current_user = users["user"]  # obs / cluster associations will be credited to this user
    with db.session.begin_nested():
        synthese_data["obs2"].cluster = cls["c4"]
        synthese_data["obs4"].cluster = cls["c5"]
    return cls


@pytest.fixture
def test_config(app, monkeypatch):
    for key, value in (
        ClustersConfigSchema().load({"VERIFY_OBS_JDD": False, "VALID_STATUS": []}).items()
    ):
        monkeypatch.setitem(app.config["CLUSTERS"], key, value)
