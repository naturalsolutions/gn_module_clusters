from flask import g
import pytest
import sqlalchemy as sa

from geonature.utils.env import db

from pypnusershub.db.models import User
from ref_geo.models import BibAreasTypes, LAreas

from gn_module_clusters.models import Cluster


@pytest.fixture
def clusters(app, users, synthese_data) -> dict[str, Cluster]:
    p1 = db.session.execute(
        sa.select(LAreas).where(
            LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
            LAreas.area_code == "26",
        )
    ).scalar_one()
    kwargs = {
        "geom": p1.geom,
        "cd_nom": synthese_data["obs2"].taxref.cd_sup,
    }
    cls: dict[str, Cluster] = {}
    with db.session.begin_nested():
        cls["c1"] = Cluster(name="Cluster 1", manager=users["self_user"], **kwargs)
        db.session.add(cls["c1"])
        cls["c2"] = Cluster(name="Cluster 2", manager=users["associate_user"], **kwargs)
        db.session.add(cls["c2"])
        cls["c3"] = Cluster(name="Cluster 3", manager=users["stranger_user"], **kwargs)
        db.session.add(cls["c3"])
        cls["c4"] = Cluster(name="Cluster 4", manager=users["user"], **kwargs)
        db.session.add(cls["c4"])
        cls["c5"] = Cluster(name="Cluster 5", manager=users["stranger_user"], **kwargs)
        db.session.add(cls["c5"])

    g.current_user = users["user"]  # obs / cluster associations will be credited to this user
    with db.session.begin_nested():
        synthese_data["obs2"].cluster = cls["c4"]
        synthese_data["obs4"].cluster = cls["c5"]
    return cls
