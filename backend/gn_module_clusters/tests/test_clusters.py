from geoalchemy2.shape import to_shape
from geonature.core.gn_synthese.models import Synthese
from gn_module_clusters import MODULE_CODE
from numpy.random import f
from pypnnomenclature.models import BibNomenclaturesTypes, TNomenclatures
import sqlalchemy as sa
import pytest
from flask import current_app, url_for
from shapely.geometry import Point
from werkzeug.exceptions import BadRequest, Forbidden, Unauthorized, Conflict

from geonature.utils.env import db
from geonature.tests.utils import set_logged_user
from ref_geo.models import LAreas, BibAreasTypes
from apptax.taxonomie.models import Taxref, TaxrefTree

from gn_module_clusters.models import Cluster, ObservarationCluster


@pytest.fixture()
def per_dataset_uuid_check(monkeypatch):
    monkeypatch.setitem(current_app.config[MODULE_CODE], "SOURCES", [1])


# Helper to be sure to never have conflict with overlapping clusters
def get_unused_cd_nom():
    return db.session.scalar(
        sa.select(Taxref.cd_nom).where(~Taxref.cd_nom.in_(sa.select(Cluster.cd_nom)))
    )


@pytest.mark.usefixtures("client_class", "temporary_transaction")
class TestClusters:
    def test_list_clusters_permissions(self, users, clusters):
        url = url_for("clusters.list_clusters")

        r = self.client.get(url)
        assert r.status_code == Unauthorized.code, r.data

        set_logged_user(self.client, users["noright_user"])
        r = self.client.get(url)
        assert r.status_code == Forbidden.code, r.data

        set_logged_user(self.client, users["self_user"])
        r = self.client.get(url)
        assert r.status_code == 200, r.data
        get_names = set([c["name"] for c in r.json])
        expected_names = set([clusters[c].name for c in ["c1"]])
        assert set([c["name"] for c in r.json]) == {clusters["c1"].name}

        set_logged_user(self.client, users["associate_user"])
        r = self.client.get(url)
        assert r.status_code == 200, r.data
        get_names = set([c["name"] for c in r.json])
        expected_names = set([clusters[c].name for c in ["c1", "c2"]])
        unexpected_names = set([clusters[c].name for c in ["c3"]])
        assert expected_names <= get_names
        assert not unexpected_names & get_names

        set_logged_user(self.client, users["stranger_user"])
        r = self.client.get(url)
        assert r.status_code == 200, r.data
        get_names = set([c["name"] for c in r.json])
        expected_names = set([clusters[c].name for c in ["c3"]])
        unexpected_names = set([clusters[c].name for c in ["c1", "c2"]])
        assert expected_names <= get_names
        assert not unexpected_names & get_names

        set_logged_user(self.client, users["admin_user"])
        r = self.client.get(url)
        assert r.status_code == 200, r.data
        get_names = set([c["name"] for c in r.json])
        expected_names = set([clusters[c].name for c in ["c1", "c2", "c3"]])
        assert expected_names <= get_names

    def test_list_cluster_json(self, users, clusters):
        set_logged_user(self.client, users["self_user"])
        r = self.client.get(
            url_for("clusters.list_clusters"),
            headers={"Accept": "application/json"},
        )
        assert r.status_code == 200, r.data
        assert r.mimetype == "application/json"
        assert "type" not in r.json

        # same without accept
        r = self.client.get(url_for("clusters.list_clusters"))
        assert r.status_code == 200, r.data
        assert r.mimetype == "application/json"
        assert "type" not in r.json

    def test_list_cluster_geojson(self, users, clusters):
        set_logged_user(self.client, users["self_user"])
        r = self.client.get(
            url_for("clusters.list_clusters"),
            headers={"Accept": "application/geo+json"},
        )
        assert r.status_code == 200, r.data
        assert r.mimetype == "application/geo+json"
        assert r.json["type"] == "FeatureCollection"

    def test_list_clusters_accepted_cd_nom(self, users, clusters):
        set_logged_user(self.client, users["admin_user"])
        url = url_for("clusters.list_clusters")

        # Invalid parameter
        r = self.client.get(url, query_string={"accepted_cd_nom": "abc"})
        assert r.status_code == BadRequest.code, r.data

        # Non-existent cd_nom
        r = self.client.get(url, query_string={"accepted_cd_nom": "-1"})
        assert r.status_code == BadRequest.code, r.data

        faucon_pelerin = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 2938))
        faucons = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 192519))
        oiseaux = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 185961))
        mammiferes = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 186206))
        assert all([faucon_pelerin, faucons, oiseaux, mammiferes])

        area = db.session.execute(
            sa.select(LAreas).where(
                LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
                LAreas.area_code == "26",
            )
        ).scalar_one()

        with db.session.begin_nested():
            faucons_cluster = Cluster(
                name="Test faucons",
                manager=users["admin_user"],
                cd_nom=faucons.cd_nom,
                geom=area.geom,
            )
            db.session.add(faucons_cluster)
            mammiferes_cluster = Cluster(
                name="Test mammiferes",
                manager=users["admin_user"],
                cd_nom=mammiferes.cd_nom,
                geom=area.geom,
            )
            db.session.add(mammiferes_cluster)

        # Filter by a descendant of faucons => faucons cluster returned
        r = self.client.get(url, query_string={"accepted_cd_nom": str(faucon_pelerin.cd_nom)})
        assert r.status_code == 200, r.data
        names = [c["name"] for c in r.json]
        assert faucons_cluster.name in names
        assert mammiferes_cluster.name not in names

        # Filter by an parent of faucons => faucons cluster NOT returned
        r = self.client.get(url, query_string={"accepted_cd_nom": str(oiseaux.cd_nom)})
        assert r.status_code == 200, r.data
        names = [c["name"] for c in r.json]
        assert faucons_cluster.name not in names
        assert mammiferes_cluster.name not in names

        # Filter by the same cd_nom => faucons cluster returned
        r = self.client.get(url, query_string={"accepted_cd_nom": str(faucons.cd_nom)})
        assert r.status_code == 200, r.data
        names = [c["name"] for c in r.json]
        assert faucons_cluster.name in names
        assert mammiferes_cluster.name not in names

        # Multiple cd_noms including a descendant => faucons cluster still returned
        r = self.client.get(
            url,
            query_string={"accepted_cd_nom": f"{oiseaux.cd_nom},{faucon_pelerin.cd_nom}"},
        )
        assert r.status_code == 200, r.data
        names = [c["name"] for c in r.json]
        assert faucons_cluster.name in names
        assert mammiferes_cluster.name not in names

    def test_get_cluster_permissions(self, users, clusters):
        def url(cluster):
            return url_for("clusters.get_cluster", id_cluster=clusters[cluster].id)

        r = self.client.get(url("c1"))
        assert r.status_code == Unauthorized.code, r.data

        set_logged_user(self.client, users["noright_user"])
        r = self.client.get(url("c1"))
        assert r.status_code == Forbidden.code, r.data

        set_logged_user(self.client, users["self_user"])
        r = self.client.get(url("c1"))
        assert r.status_code == 200, r.data
        assert r.json["id"] == clusters["c1"].id

        r = self.client.get(url("c2"))
        assert r.status_code == Forbidden.code, r.data

        set_logged_user(self.client, users["associate_user"])
        r = self.client.get(url("c1"))
        assert r.status_code == 200, r.data
        assert r.json["id"] == clusters["c1"].id

        set_logged_user(self.client, users["stranger_user"])
        r = self.client.get(url("c1"))
        assert r.status_code == Forbidden.code, r.data

        set_logged_user(self.client, users["admin_user"])
        r = self.client.get(url("c1"))
        assert r.status_code == 200, r.data
        assert r.json["id"] == clusters["c1"].id

    def test_get_cluster_json(self, users, clusters):
        set_logged_user(self.client, users["self_user"])
        r = self.client.get(
            url_for("clusters.get_cluster", id_cluster=clusters["c1"].id),
            headers={"Accept": "application/json"},
        )
        assert r.status_code == 200, r.data
        assert r.mimetype == "application/json"
        assert "type" not in r.json

        # same without accept
        r = self.client.get(
            url_for("clusters.get_cluster", id_cluster=clusters["c1"].id),
        )
        assert r.status_code == 200, r.data
        assert r.mimetype == "application/json"
        assert "type" not in r.json

    def test_get_cluster_geojson(self, users, clusters):
        set_logged_user(self.client, users["self_user"])
        r = self.client.get(
            url_for("clusters.get_cluster", id_cluster=clusters["c1"].id),
            headers={"Accept": "application/geo+json"},
        )
        assert r.status_code == 200, r.data
        assert r.mimetype == "application/geo+json"
        assert r.json["type"] == "Feature"

    def test_get_cluster_properties(self, users, clusters):
        set_logged_user(self.client, users["self_user"])
        r = self.client.get(url_for("clusters.get_cluster", id_cluster=clusters["c1"].id))
        assert r.status_code == 200, r.data
        assert "surface" in r.json, r.data

    def test_create_cluster_permissions(self, users, remove_existing_clusters):
        url = url_for("clusters.create_cluster")
        area = db.session.execute(
            sa.select(LAreas).where(
                LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
                LAreas.area_code == "26",
            )
        ).scalar_one()

        data = {"geom_4326": to_shape(area.geom_4326).wkt}

        r = self.client.post(url, json={"name": "test 1", "cd_nom": get_unused_cd_nom(), **data})
        assert r.status_code == Unauthorized.code, r.data

        # When we create a cluster, the default manager is the logged user
        set_logged_user(self.client, users["self_user"])
        r = self.client.post(url, json={"name": "test 2", "cd_nom": get_unused_cd_nom(), **data})
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == r.json["id"])
        ).scalar_one()
        assert cluster.manager.id_role == users["self_user"].id_role

        # We expect the logged user able to create cluster with himself as manager
        r = self.client.post(
            url,
            json={
                "name": "test 3",
                "manager_id": users["self_user"].id_role,
                "cd_nom": get_unused_cd_nom(),
                **data,
            },
        )
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == r.json["id"])
        ).scalar_one()
        assert cluster.manager.id_role == users["self_user"].id_role

        # With a C=1, we can not create a cluster for someone else
        r = self.client.post(
            url,
            json={
                "name": "test 4",
                "manager_id": users["associate_user"].id_role,
                "cd_nom": get_unused_cd_nom(),
                **data,
            },
        )
        assert r.status_code == Forbidden.code, r.data

        # With a C=2, we can create a cluster for someone with the same organisme
        set_logged_user(self.client, users["associate_user"])
        r = self.client.post(
            url,
            json={
                "name": "test 4",
                "manager_id": users["self_user"].id_role,
                "cd_nom": get_unused_cd_nom(),
                **data,
            },
        )
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == r.json["id"])
        ).scalar_one()
        assert cluster.manager.id_role == users["self_user"].id_role

        # But not for someone with a different organisme
        set_logged_user(self.client, users["stranger_user"])
        r = self.client.post(
            url,
            json={
                "name": "test 5",
                "manager_id": users["self_user"].id_role,
                "cd_nom": get_unused_cd_nom(),
                **data,
            },
        )
        assert r.status_code == Forbidden.code, r.data

        # The admin can create for anyone
        set_logged_user(self.client, users["admin_user"])
        r = self.client.post(
            url,
            json={
                "name": "test 5",
                "manager_id": users["stranger_user"].id_role,
                "cd_nom": get_unused_cd_nom(),
                **data,
            },
        )
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == r.json["id"])
        ).scalar_one()
        assert cluster.manager.id_role == users["stranger_user"].id_role

    def test_create_cluster_geojson(self, users):
        import json

        from shapely.geometry import mapping

        area = db.session.execute(
            sa.select(LAreas).where(
                LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
                LAreas.area_code == "26",
            )
        ).scalar_one()
        set_logged_user(self.client, users["self_user"])
        r = self.client.post(
            url_for(endpoint="clusters.create_cluster"),
            data=json.dumps(
                {
                    "type": "Feature",
                    "geometry": mapping(to_shape(element=area.geom_4326)),
                    "properties": {
                        "name": "test 1",
                        "cd_nom": get_unused_cd_nom(),
                    },
                }
            ),
            content_type="application/geo+json",
        )
        assert r.status_code == 200, r.data

    def test_create_cluster_nomenclatures(self, users):
        set_logged_user(self.client, users["self_user"])

        area = db.session.execute(
            sa.select(LAreas).where(
                LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
                LAreas.area_code == "26",
            )
        ).scalar_one()

        status = db.session.scalars(
            sa.select(TNomenclatures).where(
                TNomenclatures.nomenclature_type.has(
                    BibNomenclaturesTypes.mnemonique == "CLUSTER_STATUS"
                )
            )
        ).first()
        yearly_state = db.session.scalars(
            sa.select(TNomenclatures).where(
                TNomenclatures.nomenclature_type.has(
                    BibNomenclaturesTypes.mnemonique == "CLUSTER_YEARLY_STATE"
                )
            )
        ).first()

        r = self.client.post(
            url_for(endpoint="clusters.create_cluster"),
            json={
                "name": "test 1",
                "cd_nom": get_unused_cd_nom(),
                "geom_4326": to_shape(element=area.geom_4326).wkt,
                "status_id": status.id_nomenclature,
                "yearly_state_id": yearly_state.id_nomenclature,
            },
        )
        assert r.status_code == 200, r.data

        # Ensure that if we use nomenclature of the wrong type, we get a bad request
        r = self.client.post(
            url_for(endpoint="clusters.create_cluster"),
            json={
                "name": "test 1",
                "cd_nom": get_unused_cd_nom(),
                "geom": to_shape(element=area.geom).wkt,
                "yearly_state_id": status.id_nomenclature,
            },
        )
        assert r.status_code == BadRequest.code, r.data
        r = self.client.post(
            url_for(endpoint="clusters.create_cluster"),
            json={
                "name": "test 1",
                "cd_nom": get_unused_cd_nom(),
                "geom": to_shape(element=area.geom).wkt,
                "status_id": yearly_state.id_nomenclature,
            },
        )
        assert r.status_code == BadRequest.code, r.data

    def test_create_cluster_overlap(self, users, clusters):
        set_logged_user(self.client, users["user"])

        area = db.session.execute(
            sa.select(LAreas).where(
                LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
                LAreas.area_code == "59",
            )
        ).scalar_one()

        # Same cd_nom and overlapping geom → Conflict
        r = self.client.post(
            url_for(endpoint="clusters.create_cluster"),
            json={
                "name": "overlap test 1",
                "cd_nom": clusters["c1"].cd_nom,
                "geom_4326": to_shape(clusters["c1"].geom_4326).wkt,
            },
        )
        assert r.status_code == Conflict.code, r.data

        # Different cd_nom and overlapping geom → success
        r = self.client.post(
            url_for(endpoint="clusters.create_cluster"),
            json={
                "name": "overlap test 2",
                "cd_nom": get_unused_cd_nom(),
                "geom_4326": to_shape(clusters["c1"].geom_4326).wkt,
            },
        )
        assert r.status_code == 200, r.data

        # Same cd_nom and non-overlapping geom → success
        r = self.client.post(
            url_for(endpoint="clusters.create_cluster"),
            json={
                "name": "overlap test 3",
                "cd_nom": clusters["c1"].cd_nom,
                "geom_4326": to_shape(area.geom_4326).wkt,
            },
        )
        assert r.status_code == 200, r.data

    def test_update_cluster_permissions(self, users, clusters):
        def url(cluster):
            return url_for("clusters.update_cluster", id_cluster=clusters[cluster].id)

        r = self.client.post(url("c1"), json={"name": "modified 1"})
        assert r.status_code == Unauthorized.code, r.data

        # U=1 allows to modify its own cluster
        set_logged_user(self.client, users["self_user"])
        r = self.client.post(url("c1"), json={"name": "modified 1"})
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == r.json["id"])
        ).scalar_one()
        assert cluster.name == "modified 1"

        # but not one of someone else
        set_logged_user(self.client, users["self_user"])
        r = self.client.post(url("c2"), json={"name": "modified 1"})
        assert r.status_code == Forbidden.code, r.data

        # U=2 allows to modify its own cluster
        set_logged_user(self.client, users["associate_user"])
        r = self.client.post(url("c2"), json={"name": "modified 2"})
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == r.json["id"])
        ).scalar_one()
        assert cluster.name == "modified 2"

        # and one of someone with the same organisme
        set_logged_user(self.client, users["associate_user"])
        r = self.client.post(url("c1"), json={"name": "modified 3"})
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == r.json["id"])
        ).scalar_one()
        assert cluster.name == "modified 3"

        # but not one with another organisme
        set_logged_user(self.client, users["associate_user"])
        r = self.client.post(url("c3"), json={"name": "modified 4"})
        assert r.status_code == Forbidden.code, r.data

        # admin can change all clusters
        set_logged_user(self.client, users["admin_user"])
        r = self.client.post(url("c3"), json={"name": "modified 4"})
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == r.json["id"])
        ).scalar_one()
        assert cluster.name == "modified 4"

    def test_update_cluster_manager(self, users, clusters):
        def url(cluster):
            return url_for("clusters.update_cluster", id_cluster=clusters[cluster].id)

        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == clusters["c1"].id)
        ).scalar_one()
        assert cluster.manager.id_role == users["self_user"].id_role

        set_logged_user(self.client, users["self_user"])
        r = self.client.post(url("c1"), json={"manager_id": users["associate_user"].id_role})
        assert r.status_code == Forbidden.code, r.data
        db.session.refresh(cluster)
        assert cluster.manager.id_role == users["self_user"].id_role

        # c1 was belonging to self_user and now belogns to associate_user
        set_logged_user(self.client, users["associate_user"])
        r = self.client.post(url("c1"), json={"manager_id": users["associate_user"].id_role})
        assert r.status_code == 200, r.data
        db.session.refresh(cluster)
        assert cluster.manager.id_role == users["associate_user"].id_role
        # and back to self_user
        r = self.client.post(url("c1"), json={"manager_id": users["self_user"].id_role})
        assert r.status_code == 200, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == clusters["c1"].id)
        ).scalar_one()
        assert cluster.manager.id_role == users["self_user"].id_role

        # but not to stranger_user
        r = self.client.post(url("c1"), json={"manager_id": users["stranger_user"].id_role})
        assert r.status_code == Forbidden.code, r.data
        cluster = db.session.execute(
            sa.select(Cluster).where(Cluster.id == clusters["c1"].id)
        ).scalar_one()
        assert cluster.manager.id_role == users["self_user"].id_role

        r = self.client.post(url("c1"), json={"manager_id": -1})
        assert r.status_code == BadRequest.code, r.data

    def test_update_cluster_geom(self, users, clusters):
        set_logged_user(self.client, users["self_user"])

        # Verify fixtures are appropriate for this test purpose
        assert clusters["c1"].cd_nom == clusters["c2"].cd_nom
        assert clusters["c1"].cd_nom != clusters["c5"].cd_nom
        assert clusters["c1"].geom_4326 == clusters["c5"].geom_4326

        # Update without geom or cd_nom change → success
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"name": "updated name"},
        )
        assert r.status_code == 200, r.data

        # update with same geom as c2 (same cd_nom) → Conflict
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"geom_4326": to_shape(clusters["c2"].geom_4326).wkt},
        )
        assert r.status_code == Conflict.code, r.data

        # update with same geom as c5 (different cd_nom) → success
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"geom_4326": to_shape(clusters["c5"].geom_4326).wkt},
        )
        assert r.status_code == 200, r.data
        assert clusters["c1"].geom_4326 == clusters["c5"].geom_4326

        # update with same cd_nom as c5 (same geom) → Conflict
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"cd_nom": clusters["c5"].cd_nom},
        )
        assert r.status_code == Conflict.code, r.data

    def test_update_cluster_nomenclatures(self, users, clusters):
        def url(cluster):
            return url_for("clusters.update_cluster", id_cluster=clusters[cluster].id)

        set_logged_user(self.client, users["self_user"])

        area = db.session.execute(
            sa.select(LAreas).where(
                LAreas.area_type.has(BibAreasTypes.type_code == "DEP"),
                LAreas.area_code == "26",
            )
        ).scalar_one()
        taxon = db.session.scalars(
            sa.select(Taxref).where(Taxref.lb_nom == "Canis lupus").limit(1)
        ).first()

        status = db.session.scalars(
            sa.select(TNomenclatures).where(
                TNomenclatures.nomenclature_type.has(
                    BibNomenclaturesTypes.mnemonique == "CLUSTER_STATUS"
                )
            )
        ).first()
        yearly_state = db.session.scalars(
            sa.select(TNomenclatures).where(
                TNomenclatures.nomenclature_type.has(
                    BibNomenclaturesTypes.mnemonique == "CLUSTER_YEARLY_STATE"
                )
            )
        ).first()

        r = self.client.post(
            url("c1"),
            json={
                "status_id": status.id_nomenclature,
                "yearly_state_id": yearly_state.id_nomenclature,
            },
        )
        assert r.status_code == 200, r.data

        r = self.client.post(
            url("c1"),
            json={
                "status_id": yearly_state.id_nomenclature,
                "yearly_state_id": status.id_nomenclature,
            },
        )
        assert r.status_code == BadRequest.code, r.data

        r = self.client.post(
            url("c1"),
            json={
                "status_id": -1,
            },
        )
        assert r.status_code == BadRequest.code, r.data

    def test_update_cluster_cd_nom(self, users, clusters, synthese_data):
        set_logged_user(self.client, users["self_user"])

        # # Verify fixtures are appropriate for this test purpose
        # assert clusters["c1"].cd_nom == clusters["c2"].cd_nom
        # assert clusters["c1"].cd_nom != clusters["c5"].cd_nom
        # assert clusters["c1"].geom_4326 == clusters["c5"].geom_4326

        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"cd_nom": -1},
        )
        assert r.status_code == BadRequest.code, r.data

        animaux = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 183716))
        oiseaux = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 185961))
        rapaces_diurnes = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 186050))
        faucons = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 192519))
        faucon_pelerin = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 2938))
        mammiferes = db.session.scalar(sa.select(Taxref).where(Taxref.cd_nom == 186206))
        with db.session.begin_nested():
            clusters["c1"].cd_nom = oiseaux.cd_nom
            synthese_data["obs2"].cd_nom = faucons.cd_nom
            synthese_data["obs2"].cluster = clusters["c1"]

        # animaux >= faucons => OK
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"cd_nom": animaux.cd_nom},
        )
        assert r.status_code == 200, r.data

        # rapaces_diurnes >= faucons => OK
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"cd_nom": rapaces_diurnes.cd_nom},
        )
        assert r.status_code == 200, r.data

        # faucons >= faucons => OK
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"cd_nom": faucons.cd_nom},
        )
        assert r.status_code == 200, r.data

        # ! faucon_pelerin >= faucons => KO
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"cd_nom": faucon_pelerin.cd_nom},
        )
        assert r.status_code == BadRequest.code, r.data

        # ! mammifères >= faucons => KO
        r = self.client.post(
            url_for(endpoint="clusters.update_cluster", id_cluster=clusters["c1"].id),
            json={"cd_nom": mammiferes.cd_nom},
        )
        assert r.status_code == BadRequest.code, r.data

    def test_delete_cluster_permissions(self, users, clusters):
        def url(cluster):
            return url_for("clusters.delete_cluster", id_cluster=clusters[cluster].id)

        r = self.client.delete(url("c1"))
        assert r.status_code == Unauthorized.code, r.data

        set_logged_user(self.client, users["stranger_user"])
        r = self.client.delete(url("c1"))
        assert r.status_code == Forbidden.code, r.data
        assert db.session.scalar(db.select(sa.exists().where(Cluster.name == clusters["c1"].name)))

        set_logged_user(self.client, users["self_user"])
        r = self.client.delete(url("c2"))
        assert r.status_code == Forbidden.code, r.data
        assert db.session.scalar(db.select(sa.exists().where(Cluster.name == clusters["c2"].name)))

        set_logged_user(self.client, users["associate_user"])
        r = self.client.delete(url("c1"))
        assert r.status_code == 204, r.data
        assert not db.session.scalar(
            db.select(sa.exists().where(Cluster.name == clusters["c1"].name))
        )

        set_logged_user(self.client, users["associate_user"])
        r = self.client.delete(url("c2"))
        assert r.status_code == 204, r.data
        assert not db.session.scalar(
            db.select(sa.exists().where(Cluster.name == clusters["c1"].name))
        )

        r = self.client.delete(url("c3"))
        assert r.status_code == Forbidden.code, r.data
        assert db.session.scalar(db.select(sa.exists().where(Cluster.name == clusters["c3"].name)))

        set_logged_user(self.client, users["admin_user"])
        r = self.client.delete(url("c3"))
        assert r.status_code == 204, r.data
        assert not db.session.scalar(
            db.select(sa.exists().where(Cluster.name == clusters["c3"].name))
        )

    def test_delete_cluster_with_obs(self, users, clusters):
        set_logged_user(self.client, users["user"])
        r = self.client.delete(
            url_for(endpoint="clusters.delete_cluster", id_cluster=clusters["c4"].id)
        )
        assert r.status_code == Conflict.code, r.data
        assert db.session.scalar(db.select(sa.exists().where(Cluster.name == clusters["c4"].name)))

    def test_delete_obs_cascade(self, clusters, synthese_data):
        db.session.execute(
            sa.delete(Synthese).where(Synthese.id_synthese == synthese_data["obs1"].id_synthese),
            execution_options={"synchronize_session": False},
        )
        assert not db.session.scalar(
            db.select(sa.exists().where(Synthese.id_synthese == synthese_data["obs1"].id_synthese))
        )
        assert not db.session.scalar(
            db.select(
                sa.exists().where(
                    ObservarationCluster.id_synthese == synthese_data["obs1"].id_synthese
                )
            )
        )

    def test_cluster_observation_add(
        self, users, clusters, synthese_data, sources_modules, monkeypatch
    ):
        def url(cluster, obs):
            return url_for(
                "clusters.cluster_add_observation",
                id_cluster=clusters[cluster].id,
                id_observation=synthese_data[obs].id_synthese,
            )

        set_logged_user(self.client, users["user"])

        # We can not add an obs to a cluster on which we do not have the rights
        r = self.client.post(url("c3", "obs1"))
        assert r.status_code == Forbidden.code, r.data
        assert "no rights on this cluster" in r.json["description"], r.data

        # We can not add observations from a source not in module config
        assert synthese_data["obs1"].id_source != sources_modules[1].id_source
        monkeypatch.setitem(
            current_app.config["CLUSTERS"], "SOURCES", [sources_modules[1].id_source]
        )
        r = self.client.post(url("c1", "obs1"))
        assert r.status_code == Forbidden.code, r.data
        assert "allowed source" in r.json["description"], r.data
        monkeypatch.setitem(
            current_app.config["CLUSTERS"], "SOURCES", [s.id_source for s in synthese_data.values()]
        )

        # We can not add observations with a cd_nom not in cluster taxon tree
        assert not synthese_data["obs1"].taxref.tree <= clusters["c1"].taxref.tree
        r = self.client.post(url("c1", "obs1"))
        assert r.status_code == BadRequest.code, r.data
        assert "not in cluster taxon tree" in r.json["description"], r.data

        # We can not add an obs which is already in a cluster on which we do not have the rights
        r = self.client.post(url("c1", "obs4"))
        assert r.status_code == Forbidden.code, r.data
        assert "cluster on which you do not have rights" in r.json["description"], r.data

        r = self.client.post(url("c1", "obs2"))
        assert r.status_code == 204, r.data

        db.session.refresh(synthese_data["obs2"])
        assert synthese_data["obs2"].cluster == clusters["c1"]

    def test_cluster_observation_remove(self, users, clusters, synthese_data):
        def url(cluster, obs):
            return url_for(
                "clusters.cluster_remove_observation",
                id_cluster=clusters[cluster].id,
                id_observation=synthese_data[obs].id_synthese,
            )

        set_logged_user(self.client, users["user"])
        r = self.client.delete(url("c4", "obs2"))
        assert r.status_code == 204, r.data
        db.session.refresh(synthese_data["obs2"])
        assert synthese_data["obs2"].cluster == None
