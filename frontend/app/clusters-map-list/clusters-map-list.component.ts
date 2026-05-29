import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { UntypedFormControl } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import * as cloneDeep from 'lodash/cloneDeep';
import * as L from 'leaflet';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { ConfigService } from '@geonature/services/config.service';
import { SyntheseDataService } from '@geonature_common/form/synthese-form/synthese-data.service';
import { MapListService } from '@geonature_common/map-list/map-list.service';
import { MapService } from '@geonature_common/map/map.service';
import { SyntheseFormService } from '@geonature_common/form/synthese-form/synthese-form.service';
import { SyntheseCarteComponent } from '../synthese-results/synthese-carte/synthese-carte.component';

import { SyntheseStoreService } from '../services/store.service';
import { SyntheseModalDownloadComponent } from '../synthese-results/synthese-list/modal-download/modal-download.component';
import { ClustersDataService } from '../services/clusters-data.service';
import { ClustersAssociateModalComponent } from '../clusters-associate-modal/clusters-associate-modal.component';
import { Cluster, getTaxonName } from '../models';

@Component({
  selector: 'pnx-clusters-map-list',
  styleUrls: ['clusters-map-list.component.scss'],
  templateUrl: 'clusters-map-list.component.html',
})
export class ClustersMapListComponent implements OnInit, AfterViewInit, OnDestroy {
  private idsByFeature: Set<number>;
  private noGeomMessage: boolean;

  public isSearchBarReduced = true;
  public activeTab: string = 'observations';
  public clusters: Cluster[] = [];
  public selectedClusterId: number | null = null;
  public selectedObsIds: Set<number> = new Set();
  public selectedObsRowId: number | null = null;
  public clusterFilter: null | number[] = [];
  public includeOrphanObs = true;
  public showClusters = true;
  @ViewChild(SyntheseCarteComponent) syntheseCarte: SyntheseCarteComponent;

  get observationCountLabel(): string {
    const count = this.mapListService.tableData.length;
    const limit = this.config.CLUSTERS.OBSERVATIONS_LIMIT;
    return count >= limit ? `${count}+` : String(count);
  }

  private clusterFC: GeoJSON.FeatureCollection | null = null;
  private clusterFeatureGroup: L.FeatureGroup;
  private subscriptions: Subscription[] = [];
  private _withClusterInput: HTMLInputElement | null = null;
  private clusterDefaultStyle = {
    color: '#FF8C00',
    weight: 3,
    fillColor: '#FF8C00',
    fillOpacity: 0.15,
  };
  private clusterSelectedStyle = {
    color: '#FF0000',
    weight: 4,
    fillColor: '#FF0000',
    fillOpacity: 0.3,
  };

  constructor(
    public config: ConfigService,
    public searchService: SyntheseDataService,
    public mapListService: MapListService,
    private modalService: NgbModal,
    private formService: SyntheseFormService,
    private syntheseStore: SyntheseStoreService,
    private toasterService: ToastrService,
    private route: ActivatedRoute,
    private ngModal: NgbModal,
    private changeDetector: ChangeDetectorRef,
    private router: Router,
    private clustersDataService: ClustersDataService,
    private _ms: MapService
  ) {
    this.clusterFeatureGroup = new L.FeatureGroup();
  }

  ngOnInit() {
    this.formService.selectors = this.formService.selectors
      .set('limit', this.config.CLUSTERS.OBSERVATIONS_LIMIT)
      .set('format', 'grouped_geom');

    this.route.queryParamMap.subscribe((params) => {
      if (params.get('id_dataset')) {
        this.formService.searchForm.patchValue({ id_dataset: params.get('id_dataset') });
      }

      if (params.get('id_acquisition_framework')) {
        this.formService.searchForm.patchValue({
          id_acquisition_framework: params.get('id_acquisition_framework'),
        });
      }

      const idSynthese = this.route.snapshot.paramMap.get('id_synthese');
      if (idSynthese) {
        this.formService.searchForm.patchValue({ id_synthese: params.get('idSynthese') });
        this.openInfoModal(idSynthese);
      }

      this.initializeForm();
      this.applyDefaultFormValues(params);
    });

    this.loadClusters();

    this.subscriptions.push(
      this.mapListService.onMapClik$.subscribe((ids: any) => {
        this.selectedObsIds = new Set(Array.isArray(ids) ? ids : [ids]);
        this.selectedClusterId = null;
        this.selectedObsRowId = null;
        this.resetClusterStyles();
        this.activeTab = 'observations';
      })
    );
  }

  ngAfterViewInit() {
    if (this._ms.map) {
      this._ms.map.addLayer(this.clusterFeatureGroup);
      this.addClustersSwitch();
      this.addObsWithoutClusterSwitch();
      this.addObsWithClusterSwitch();
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe());
    if (this._ms.map && this.clusterFeatureGroup) {
      this._ms.map.removeLayer(this.clusterFeatureGroup);
    }
  }

  private loadClusters() {
    this.clustersDataService.listClusters().subscribe((fc) => {
      this.clusterFC = fc;
      this.clusters = (fc.features || []).map((f) => f.properties as Cluster);
      this.updateClusterLayer();
    });
  }

  private buildClusterGeoJSON(): GeoJSON.FeatureCollection {
    if (!this.clusterFC) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: this.clusterFC.features.filter((f) => f.geometry),
    };
  }

  private updateClusterLayer() {
    this.clusterFeatureGroup.clearLayers();
    const geojson = this.buildClusterGeoJSON();
    if (geojson.features.length > 0) {
      const layer = L.geoJSON(geojson, {
        style: () => this.clusterDefaultStyle,
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, {
            radius: 8,
            color: '#FF8C00',
            fillColor: '#FF8C00',
            fillOpacity: 0.6,
            weight: 2,
          }),
        onEachFeature: (feature, layer) => {
          layer.on({
            click: () => {
              this.onClusterMapClick(feature.properties.id);
            },
          });
          layer.bindTooltip(`<b>${feature.properties.name}</b>`, {
            sticky: true,
          });
          layer.bindPopup(
            `<b>${feature.properties.name}</b><br/>Espèce : ${getTaxonName(feature.properties as Cluster)}`
          );
        },
      });
      this.clusterFeatureGroup.addLayer(layer);
    }
  }

  private resetClusterStyles() {
    this.clusterFeatureGroup.eachLayer((fgLayer: any) => {
      if (fgLayer.eachLayer) {
        fgLayer.eachLayer((layer: any) => {
          if (layer.feature) {
            const geomType = layer.feature.geometry?.type;
            if (geomType === 'Point') {
              layer.setStyle({
                radius: 8,
                color: '#FF8C00',
                fillColor: '#FF8C00',
                fillOpacity: 0.6,
                weight: 2,
              });
            } else {
              layer.setStyle(this.clusterDefaultStyle);
            }
          }
        });
      }
    });
  }

  private highlightClusterLayer(clusterId: number) {
    this.resetClusterStyles();
    this.clusterFeatureGroup.eachLayer((fgLayer: any) => {
      if (fgLayer.eachLayer) {
        fgLayer.eachLayer((layer: any) => {
          if (layer.feature && layer.feature.properties.id === clusterId) {
            const geomType = layer.feature.geometry?.type;
            if (geomType === 'Point') {
              layer.setStyle({
                radius: 12,
                color: '#FF0000',
                fillColor: '#FF0000',
                fillOpacity: 0.8,
                weight: 3,
              });
            } else {
              layer.setStyle(this.clusterSelectedStyle);
            }
            if (layer.getBounds) {
              this._ms.map.fitBounds(layer.getBounds(), { maxZoom: 18 });
            } else if (layer.getLatLng) {
              this._ms.map.setView(layer.getLatLng(), 15);
            }
          }
        });
      }
    });
  }

  onClusterClick(cluster: Cluster) {
    this.selectedObsIds = new Set();
    this.selectedObsRowId = null;
    this.selectedClusterId = cluster.id;
    this.syntheseCarte?.clearMapSelection();
    this.highlightClusterLayer(cluster.id);
    this.activeTab = 'clusters';
  }

  private onClusterMapClick(clusterId: number) {
    this.selectedClusterId = clusterId;
    const cluster = this.clusters.find((c) => c.id === clusterId);
    if (cluster) {
      this.onClusterClick(cluster);
    }
  }

  private initializeForm() {
    this.formService.selectedCdRefFromTree = [];
    this.formService.selectedTaxonFromRankInput = [];
    this.formService.selectedtaxonFromComponent = [];
    this.formService.selectedRedLists = [];
    this.formService.selectedStatus = [];
    this.formService.selectedTaxRefAttributs = [];
  }

  private applyDefaultFormValues(params) {
    const sources = this.config.CLUSTERS.SOURCES;
    if (sources && sources.length > 0) {
      if (!this.formService.searchForm.contains('id_source')) {
        this.formService.searchForm.addControl(
          'id_source',
          new UntypedFormControl(sources)
        );
      } else {
        this.formService.searchForm.patchValue({ id_source: sources });
      }
    }
    this.formService
      .processDefaultFilters(this.config.SYNTHESE.DEFAULT_FILTERS)
      .subscribe((processedDefaultFilters) => {
        if (params.get('id_import')) {
          processedDefaultFilters['id_import'] = params.get('id_import');
        }
        this.formService.searchForm.patchValue(processedDefaultFilters);
        this.formService.processedDefaultFilters = processedDefaultFilters;
        this.changeDetector.detectChanges();

        this.loadData();
      });
  }

  loadData() {
    let formParams = this.formService.formatParams();
    if (this.clusterFilter === null && !this.includeOrphanObs) {
      formParams['cluster_id'] = '*';
    } else if (this.clusterFilter === null && this.includeOrphanObs) {
      // no cluster filter → show all
    } else if (this.clusterFilter !== null && !this.includeOrphanObs) {
      formParams['cluster_id'] = this.clusterFilter;
    } else if (this.clusterFilter !== null && this.includeOrphanObs) {
      formParams['cluster_id'] = [null, ...this.clusterFilter];
    }
    this.searchService.dataLoaded = false;
    this.formService.searchForm.markAsPristine();

    this.searchService.getSyntheseData(formParams, this.formService.selectors).subscribe(
      (data) => {
        this.parseGeoJson(data);
        this.displayMessageLimitNumberObservationsReached(formParams);
        this.searchService.dataLoaded = true;
      },
      () => {
        this.searchService.dataLoaded = true;
      }
    );
  }

  private parseGeoJson(rawGeojson) {
    this.initializeStores(rawGeojson);

    let geojson = cloneDeep(rawGeojson);
    geojson.features.forEach((feature) => {
      this.idsByFeature = new Set();
      this.checkGeomAbsence(feature);

      feature.properties.observations.forEach((obs) => {
        this.extractIds(obs);
        this.addObservationToDataTable(cloneDeep(obs));
      });

      // WARNING: needs to return the updated object here !
      feature.properties.observations = this.buildObservationsProperty();
    });

    this.displayMessageGeomAbsence();
    this.orderDataTableByDates();
    this.mapListService.geojsonData = geojson;
  }

  private initializeStores(rawGeojson) {
    this.syntheseStore.clearData();
    this.syntheseStore.setData(rawGeojson);
    this.mapListService.idName = 'id_synthese';
    this.mapListService.tableData = [];
    this.noGeomMessage = false;
  }

  private extractIds(observation) {
    if (observation['id_synthese']) {
      const id = observation['id_synthese'];
      if (this.syntheseStore.idSyntheseList.has(id) === false) {
        this.syntheseStore.idSyntheseList.add(id);
      }

      if (this.idsByFeature.has(id) === false) {
        this.idsByFeature.add(id);
      }
    }
  }

  private addObservationToDataTable(observation) {
    if (observation['id_synthese']) {
      if (this.mapListService.tableData.includes(observation.id_synthese) === false) {
        this.mapListService.tableData.push(observation);
      }
    }
  }

  private checkGeomAbsence(feature) {
    if (!feature.geometry) {
      this.noGeomMessage = true;
    }
  }

  private buildObservationsProperty() {
    return { id_synthese: Array.from(this.idsByFeature) };
  }

  private displayMessageLimitNumberObservationsReached(formParams) {
    if (this.syntheseStore.idSyntheseList.size >= this.config.SYNTHESE.NB_MAX_OBS_MAP) {
      const modalRef = this.modalService.open(SyntheseModalDownloadComponent, {
        size: 'lg',
      });
      modalRef.componentInstance.queryString = this.searchService.buildQueryUrl(formParams);
      modalRef.componentInstance.tooManyObs = true;
    }
  }

  private displayMessageGeomAbsence() {
    if (this.noGeomMessage) {
      this.toasterService.warning(
        "Certaine(s) observation(s) n'ont pas pu être affiché(es) sur la carte car leur maille d'agrégation n'est pas disponible"
      );
    }
  }

  private orderDataTableByDates() {
    this.mapListService.tableData = this.mapListService.tableData.sort((a, b) => {
      return (new Date(b.date_min).valueOf() as any) - new Date(a.date_min).valueOf();
    });
  }

  onSearchEvent() {
    this.formService.selectors = this.formService.selectors.set('limit', this.config.CLUSTERS.OBSERVATIONS_LIMIT);
    this.syntheseStore.clearData();
    this.loadData();
  }

  private addObsWithoutClusterSwitch() {
    const OrphanFilterControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create(
          'div',
          'leaflet-bar custom-control custom-switch leaflet-control-custom clusters-orphan-filter'
        );
        const input = L.DomUtil.create('input', 'custom-control-input', container);
        input.id = 'toggle-orphan-filter-btn';
        input.type = 'checkbox';
        input.checked = this.includeOrphanObs;
        input.onclick = () => {
          this.includeOrphanObs = input.checked;
          this.onSearchEvent();
        };
        const label = L.DomUtil.create('label', 'custom-control-label', container);
        label.setAttribute('for', 'toggle-orphan-filter-btn');
        label.innerText = 'Observations sans foyer';
        return container;
      },
    });
    this._ms.map.addControl(new OrphanFilterControl());
  }

  private addObsWithClusterSwitch() {
    const WithClusterControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create(
          'div',
          'leaflet-bar custom-control custom-switch leaflet-control-custom clusters-orphan-filter'
        );
        const input = L.DomUtil.create('input', 'custom-control-input', container);
        input.id = 'toggle-with-cluster-btn';
        input.type = 'checkbox';
        this._withClusterInput = input;
        this.updateWithClusterSwitch();
        input.onclick = () => {
          if (Array.isArray(this.clusterFilter) && this.clusterFilter.length > 0) {
            this.clusterFilter = [];
          } else {
            this.clusterFilter = input.checked ? null : [];
          }
          this.updateWithClusterSwitch();
          this.onSearchEvent();
        };
        const label = L.DomUtil.create('label', 'custom-control-label', container);
        label.setAttribute('for', 'toggle-with-cluster-btn');
        label.innerText = 'Observations avec foyer';
        return container;
      },
    });
    this._ms.map.addControl(new WithClusterControl());
  }

  public updateWithClusterSwitch() {
    if (this._withClusterInput) {
      this._withClusterInput.checked = this.clusterFilter === null;
      this._withClusterInput.indeterminate =
        Array.isArray(this.clusterFilter) && this.clusterFilter.length > 0;
    }
  }

  private addClustersSwitch() {
    const ClusterFilterControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create(
          'div',
          'leaflet-bar custom-control custom-switch leaflet-control-custom clusters-orphan-filter'
        );
        const input = L.DomUtil.create('input', 'custom-control-input', container);
        input.id = 'toggle-clusters-btn';
        input.type = 'checkbox';
        input.checked = this.showClusters;
        input.onclick = () => {
          this.showClusters = input.checked;
          if (this.showClusters) {
            this._ms.map.addLayer(this.clusterFeatureGroup);
          } else {
            this._ms.map.removeLayer(this.clusterFeatureGroup);
          }
        };
        const label = L.DomUtil.create('label', 'custom-control-label', container);
        label.setAttribute('for', 'toggle-clusters-btn');
        label.innerText = 'Foyers';
        return container;
      },
    });
    this._ms.map.addControl(new ClusterFilterControl());
  }

  onAssociateObservations(obsIds: number[]) {
    let currentClusterId: number | null = null;
    if (obsIds.length === 1) {
      const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsIds[0]);
      currentClusterId = obs?.cluster_id ?? null;
    }
    const modalRef = this.modalService.open(ClustersAssociateModalComponent, { size: 'sm' });
    modalRef.componentInstance.clusters = this.clusters;
    modalRef.componentInstance.observationIds = obsIds;
    modalRef.componentInstance.currentClusterId = currentClusterId;
    modalRef.result.then(
      (result: { clusterId: number | null; obsIds: number[] }) => {
        const requests = result.obsIds
          .map((obsId) => {
            if (result.clusterId != null) {
              return this.clustersDataService.addObservation(result.clusterId, obsId);
            }
            const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsId);
            if (obs?.cluster_id != null) {
              return this.clustersDataService.removeObservation(obs.cluster_id, obsId);
            }
            return null;
          })
          .filter(Boolean);
        forkJoin(requests).subscribe({
          next: () => {
            for (const obsId of result.obsIds) {
              const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsId);
              if (obs) {
                obs.cluster_id = result.clusterId;
              }
            }
            this.mapListService.tableData = [...this.mapListService.tableData];
            this.toasterService.success(
              `${result.obsIds.length} observation(s) associée(s) au foyer`
            );
          },
        });
      },
      () => {}
    );
  }

  onSelectObsOnMap(idSynthese: number) {
    this.selectedObsIds = new Set();
    this.selectedObsRowId = idSynthese;
    this.selectedClusterId = null;
    this.resetClusterStyles();
    this.mapListService.tableSelected.next(idSynthese);
  }

  onClusterTaxonClick(cluster: Cluster) {
    const cdRef = cluster.taxref?.cd_ref ?? cluster.cd_nom;
    this.formService.selectedtaxonFromComponent = [];
    this.formService.selectedTaxonFromRankInput = [];
    this.formService.selectedCdRefFromTree = [cdRef];
    this.formService.searchForm.patchValue({ cd_nom: null });
    this.activeTab = 'observations';
    this.onSearchEvent();
  }

  openInfoModal(idSynthese) {
    const basePath = this.router.url.split('?')[0].split('/')[1] || 'clusters';
    this.router.navigate([`${basePath}/occurrence`, idSynthese, 'details']);
  }
}
