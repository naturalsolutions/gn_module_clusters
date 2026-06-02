import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef, ViewChild, HostListener, TemplateRef } from '@angular/core';
import { NgbTypeaheadSelectItemEvent } from '@ng-bootstrap/ng-bootstrap';
import { UntypedFormBuilder, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import * as cloneDeep from 'lodash/cloneDeep';
import * as L from 'leaflet';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { ConfigService } from '@geonature/services/config.service';
import { ModuleService } from '@geonature/services/module.service';
import { SyntheseDataService } from '@geonature_common/form/synthese-form/synthese-data.service';
import { MapListService } from '@geonature_common/map-list/map-list.service';
import { MapService } from '@geonature_common/map/map.service';
import { SyntheseFormService } from '@geonature_common/form/synthese-form/synthese-form.service';
import { ClustersObsMapComponent } from './clusters-obs-map/clusters-obs-map.component';

import { SyntheseStoreService } from '../services/store.service';
import { ClustersDataService } from '../services/clusters-data.service';
import { ClustersAssociateModalComponent } from '../clusters-associate-modal/clusters-associate-modal.component';
import { ClustersInfoModalComponent } from '../clusters-info-modal/clusters-info-modal.component';
import { DataFormService } from '@geonature_common/form/data-form.service';
import { Cluster, getTaxonName, getManagerName } from '../models';
import { Taxon } from '@geonature_common/form/taxonomy/taxonomy.component';

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
  public allClusters: Cluster[] = [];
  public selectedClusterId: number | null = null;
  public selectedObsIds: Set<number> = new Set();
  public selectedObsRowId: number | null = null;
  public clusterFilter: null | number[] = [];
  public includeOrphanObs = true;
  public showClusters = true;
  public addObsModulePath: string | null = null;
  public selectedObsForActions: number[] = [];
  public checkedObsSet: Set<number> = new Set();
  public clusterCreationMode = false;
  public editingCluster: Cluster | null = null;
  public creationForm: UntypedFormGroup;
  public waiting = false;
  private pendingAssociate: { clusterId: number; obsIds: number[] } | null = null;
  private drawnGeometry: GeoJSON.Geometry | null = null;
  private pendingObsIdsForCreation: number[] | null = null;
  @ViewChild(ClustersObsMapComponent) obsMap: ClustersObsMapComponent;
  @ViewChild('confirmDeleteModal', { static: true }) confirmDeleteModal: TemplateRef<any>;
  clusterToDelete: Cluster | null = null;

  get isEditing(): boolean {
    return this.editingCluster !== null;
  }

  get isClusterFormMode(): boolean {
    return this.clusterCreationMode || this.editingCluster !== null;
  }

  get observationCountLabel(): string {
    const count = this.mapListService.tableData.length;
    const limit = this.config.CLUSTERS.OBSERVATIONS_LIMIT;
    return count >= limit ? `${count}+` : String(count);
  }

  public acceptedTaxon: Taxon | null = null;
  public acceptedTaxonControl = new UntypedFormControl();
  public filterName = '';
  public filterStatusIds: number[] = [];
  public filterYearlyStateIds: number[] = [];
  public filterTaxonNames: string[] = [];
  public filterManagerNames: string[] = [];
  public activeDropdown = '';
  public lastSearchHadFilters = false;

  get statusOptions(): { id: number; label: string }[] {
    const map = new Map<number, string>();
    this.clusters.forEach((c) => {
      if (c.status && c.status.id_nomenclature != null) {
        map.set(c.status.id_nomenclature, c.status.label_default || c.status.mnemonique);
      }
    });
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  get yearlyStateOptions(): { id: number; label: string }[] {
    const map = new Map<number, string>();
    this.clusters.forEach((c) => {
      if (c.yearly_state && c.yearly_state.id_nomenclature != null) {
        map.set(c.yearly_state.id_nomenclature, c.yearly_state.label_default || c.yearly_state.mnemonique);
      }
    });
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  get taxonOptions(): string[] {
    const set = new Set<string>();
    this.clusters.forEach((c) => set.add(getTaxonName(c)));
    return Array.from(set).sort();
  }

  get managerOptions(): string[] {
    const set = new Set<string>();
    this.clusters.forEach((c) => {
      const name = getManagerName(c);
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }

  get filteredClusters(): Cluster[] {
    return this.clusters.filter((c) => this.clusterMatchesFilters(c));
  }

  private clusterMatchesFilters(c: Cluster): boolean {
    if (this.filterName && !c.name.toLowerCase().includes(this.filterName.toLowerCase())) return false;
    if (this.filterStatusIds.length > 0 && (!c.status || !this.filterStatusIds.includes(c.status.id_nomenclature))) return false;
    if (this.filterYearlyStateIds.length > 0 && (!c.yearly_state || !this.filterYearlyStateIds.includes(c.yearly_state.id_nomenclature))) return false;
    if (this.filterTaxonNames.length > 0 && !this.filterTaxonNames.includes(getTaxonName(c))) return false;
    if (this.filterManagerNames.length > 0 && !this.filterManagerNames.includes(getManagerName(c))) return false;
    return true;
  }

  private refreshClusterMapLayer() {
    if (this.clusterFC) {
      this.updateClusterLayer();
    }
  }

  toggleFilterStatus(id: number) {
    const idx = this.filterStatusIds.indexOf(id);
    idx >= 0 ? this.filterStatusIds.splice(idx, 1) : this.filterStatusIds.push(id);
    this.refreshClusterMapLayer();
  }

  toggleFilterYearlyState(id: number) {
    const idx = this.filterYearlyStateIds.indexOf(id);
    idx >= 0 ? this.filterYearlyStateIds.splice(idx, 1) : this.filterYearlyStateIds.push(id);
    this.refreshClusterMapLayer();
  }

  toggleFilterTaxon(name: string) {
    const idx = this.filterTaxonNames.indexOf(name);
    idx >= 0 ? this.filterTaxonNames.splice(idx, 1) : this.filterTaxonNames.push(name);
    this.refreshClusterMapLayer();
  }

  toggleFilterManager(name: string) {
    const idx = this.filterManagerNames.indexOf(name);
    idx >= 0 ? this.filterManagerNames.splice(idx, 1) : this.filterManagerNames.push(name);
    this.refreshClusterMapLayer();
  }

  onFilterNameChange(value: string) {
    this.filterName = value;
    this.refreshClusterMapLayer();
  }

  onAcceptedTaxonSelect(event: NgbTypeaheadSelectItemEvent) {
    const taxon = event.item as Taxon;
    if (taxon) {
      this.acceptedTaxon = taxon;
      this.loadClusters();
      this.loadData();
    }
  }

  onAcceptedTaxonDelete() {
    this.acceptedTaxon = null;
    this.acceptedTaxonControl.reset();
    this.loadClusters();
    this.loadData();
  }

  clearFilters() {
    this.filterName = '';
    this.filterStatusIds = [];
    this.filterYearlyStateIds = [];
    this.filterTaxonNames = [];
    this.filterManagerNames = [];
    this.refreshClusterMapLayer();
  }

  @HostListener('document:click')
  closeDropdowns() {
    this.activeDropdown = '';
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
    public moduleService: ModuleService,
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
    private _ms: MapService,
    private _fb: UntypedFormBuilder,
    private _dfService: DataFormService
  ) {
    this.clusterFeatureGroup = new L.FeatureGroup();
    this.creationForm = this._fb.group({
      geometry: [null, Validators.required],
      properties: this._fb.group({
        name: [null, Validators.required],
        notes: null,
        cd_nom: [null, Validators.required],
        status_id: null,
        yearly_state_id: null,
      }),
    });
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

    const addObsModuleCode = this.config.CLUSTERS.CREATE_OBS_MODULE;
    if (addObsModuleCode) {
      const addObsModule = this.moduleService.getModule(addObsModuleCode);
      if (addObsModule) {
        this.addObsModulePath = addObsModule.module_path;
      }
    }

    this.subscriptions.push(
      this.mapListService.onMapClik$.subscribe((ids: any) => {
        this.selectedObsIds = new Set(Array.isArray(ids) ? ids : [ids]);
        this.selectedClusterId = null;
        this.selectedObsRowId = null;
        this.resetClusterStyles();
        this.activeTab = 'observations';
      })
    );

    const pendingClusterId = this.route.snapshot.queryParamMap.get('associateClusterId');
    const pendingObsIds = this.route.snapshot.queryParamMap.get('associateObsIds');
    if (pendingClusterId && pendingObsIds) {
      this.pendingAssociate = {
        clusterId: Number(pendingClusterId),
        obsIds: pendingObsIds.split(',').map(Number),
      };
    }

    this.subscriptions.push(
      this._ms.gettingGeojson$
        .pipe(filter(() => this.isClusterFormMode))
        .subscribe((geojson) => {
          this.drawnGeometry = geojson.geometry;
          this.creationForm.patchValue({ geometry: geojson.geometry });
        })
    );
  }

  ngAfterViewInit() {
    if (this._ms.map) {
      this._ms.map.addLayer(this.clusterFeatureGroup);
      this.obsMap?.bringObservationsToFront();
      this.addClustersSwitch();
      this.addObsWithoutClusterSwitch();
      this.addObsWithClusterSwitch();
      this.addMapLegend();
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe());
    if (this.isClusterFormMode) {
      this._ms.map.off((L as any).Draw.Event.DRAWSTART, this._clearGeometryOnDrawStart);
    }
    if (this._ms.map && this.clusterFeatureGroup) {
      this._ms.map.removeLayer(this.clusterFeatureGroup);
    }
  }

  private loadClusters() {
    const cdNoms = this.acceptedTaxon ? [this.acceptedTaxon.cd_nom] : [];
    this.clustersDataService.listClustersByCdNoms(cdNoms).subscribe((fc) => {
      this.clusterFC = fc;
      this.clusters = (fc.features || []).map((f) => f.properties as Cluster);
      this.updateClusterLayer();
    });
    this.clustersDataService.listClusters().subscribe((fc) => {
      this.allClusters = (fc.features || []).map((f) => f.properties as Cluster);
    });
  }

  private buildClusterGeoJSON(): GeoJSON.FeatureCollection {
    if (!this.clusterFC) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: this.clusterFC.features.filter((f) => f.geometry && this.clusterMatchesFilters(f.properties as Cluster)),
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
    this.obsMap?.clearMapSelection();
    this.highlightClusterLayer(cluster.id);
    this.activeTab = 'clusters';
  }

  onClusterInfo(cluster: Cluster) {
    const modalRef = this.modalService.open(ClustersInfoModalComponent, { size: 'lg' });
    modalRef.componentInstance.cluster = cluster;
    modalRef.result.then(
      (result) => this.enterEditMode(result),
      () => {}
    );
  }

  onDeleteCluster(cluster: Cluster) {
    this.clusterToDelete = cluster;
    this.modalService.open(this.confirmDeleteModal).result.then(
      () => {
        this.clustersDataService.deleteCluster(cluster.id).subscribe({
          next: () => {
            this.toasterService.success('Foyer supprimé');
            this.clusterToDelete = null;
            this.loadClusters();
          },
          error: () => {
            this.toasterService.error('Erreur lors de la suppression');
            this.clusterToDelete = null;
          },
        });
      },
      () => { this.clusterToDelete = null; }
    );
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
      .processDefaultFilters(this.config.CLUSTERS.DEFAULT_FILTERS)
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
    this.lastSearchHadFilters = Object.keys(formParams).some(
      key => key !== 'id_source'
    );
    if (this.clusterFilter === null && !this.includeOrphanObs) {
      formParams['cluster_id'] = '*';
    } else if (this.clusterFilter === null && this.includeOrphanObs) {
      // no cluster filter → show all
    } else if (this.clusterFilter !== null && !this.includeOrphanObs) {
      formParams['cluster_id'] = this.clusterFilter;
    } else if (this.clusterFilter !== null && this.includeOrphanObs) {
      formParams['cluster_id'] = [null, ...this.clusterFilter];
    }
    if (this.acceptedTaxon) {
      formParams['cd_ref_parent'] = [this.acceptedTaxon.cd_ref];
      formParams['cd_ref'] = [this.acceptedTaxon.cd_ref];
    }
    this.searchService.dataLoaded = false;
    this.formService.searchForm.markAsPristine();

    this.searchService.getSyntheseData(formParams, this.formService.selectors).subscribe(
      (data) => {
        this.parseGeoJson(data);
        this.searchService.dataLoaded = true;
        this.checkPendingAssociate();
      },
      () => {
        this.searchService.dataLoaded = true;
        this.checkPendingAssociate();
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

  private addMapLegend() {
    const LegendControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar clusters-legend');
        container.innerHTML = `
          <div style="display:flex;align-items:center;padding:2px 6px;font-size:12px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3388FF;margin-right:4px"></span>
            Observations
          </div>
          <div style="display:flex;align-items:center;padding:2px 6px;font-size:12px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#FF8C00;margin-right:4px"></span>
            Foyers
          </div>
        `;
        return container;
      },
    });
    this._ms.map.addControl(new LegendControl());
  }

  onAssociateObservations(obsIds: number[], preselectedClusterId?: number) {
    let currentClusterId: number | null = null;
    if (obsIds.length === 1) {
      const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsIds[0]);
      currentClusterId = obs?.cluster_id ?? null;
    }

    const cdNomsSet = new Set<number>();
    for (const obsId of obsIds) {
      const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsId);
      if (obs?.cd_nom) cdNomsSet.add(obs.cd_nom);
    }

    this.clustersDataService.listClustersByCdNoms(Array.from(cdNomsSet)).subscribe((fc) => {
      const clusters = (fc.features || []).map((f) => f.properties as Cluster);
      const modalRef = this.modalService.open(ClustersAssociateModalComponent, { size: 'lg' });
      modalRef.componentInstance.clusters = clusters;
      modalRef.componentInstance.observationIds = obsIds;
      modalRef.componentInstance.currentClusterId = currentClusterId;
      modalRef.componentInstance.preselectedClusterId = preselectedClusterId ?? null;
      modalRef.componentInstance.createCluster = () => this.onCreateCluster(obsIds);
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
    });
  }

  onSelectObsOnMap(idSynthese: number) {
    this.selectedObsIds = new Set();
    this.selectedObsRowId = idSynthese;
    this.selectedClusterId = null;
    this.resetClusterStyles();
    this.mapListService.tableSelected.next(idSynthese);
  }

  onClusterTaxonClick(cluster: Cluster) {
    if (cluster.taxref) {
      this.acceptedTaxon = cluster.taxref;
      this.acceptedTaxonControl.setValue(cluster.taxref);
      this.loadClusters();
      this.loadData();
    }
  }

  onObsTaxonClick(cdNom: number) {
    this._dfService.getTaxonInfo(cdNom).subscribe((taxon: Taxon) => {
      this.acceptedTaxon = taxon;
      this.acceptedTaxonControl.setValue(taxon);
      this.loadClusters();
      this.loadData();
    });
  }

  private checkPendingAssociate() {
    if (this.pendingAssociate && this.searchService.dataLoaded) {
      const { clusterId, obsIds } = this.pendingAssociate;
      this.pendingAssociate = null;
      this.onAssociateObservations(obsIds, clusterId);
    }
  }

  onCreateCluster(obsIds?: number[]) {
    this.pendingObsIdsForCreation = obsIds || null;
    if (obsIds && obsIds.length > 0 && obsIds.length === 1) {
      const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsIds[0]);
      if (obs?.cd_nom) {
        this.enterDrawingMode(obs.cd_nom);
        return;
      }
    }
    this.enterDrawingMode();
  }

  onObsSelectionChange(ids: number[]) {
    this.selectedObsForActions = ids;
    this.checkedObsSet = new Set(ids);
    if (this.obsMap) {
      this.obsMap.updateCheckedObsIds(this.checkedObsSet);
    }
  }

  onAddObs() {
    if (this.addObsModulePath) {
      this.router.navigate([`/${this.addObsModulePath}`]);
    }
  }

  openInfoModal(idSynthese) {
    const basePath = this.router.url.split('?')[0].split('/')[1] || 'clusters';
    this.router.navigate([`${basePath}/occurrence`, idSynthese, 'details']);
  }

  onToggleSearchBar() {
    if (this.isSearchBarReduced && this.isClusterFormMode) {
      this.exitFormMode();
    }
    this.isSearchBarReduced = !this.isSearchBarReduced;
  }

  enterDrawingMode(cdNom?: number) {
    this.clusterCreationMode = true;
    this.editingCluster = null;
    this.isSearchBarReduced = true;
    this.activeTab = 'clusters';
    this.drawnGeometry = null;
    this.creationForm.reset();
    if (cdNom) {
      this._dfService.getTaxonInfo(cdNom).subscribe((taxon) => {
        this.creationForm.patchValue({ properties: { cd_nom: taxon } });
      });
    }
    this._ms.map.on((L as any).Draw.Event.DRAWSTART, this._clearGeometryOnDrawStart);
  }

  enterEditMode(cluster: Cluster) {
    this.clusterCreationMode = false;
    this.editingCluster = cluster;
    this.isSearchBarReduced = true;
    this.activeTab = 'clusters';
    this.drawnGeometry = null;
    this.creationForm.reset();
    this._ms.map.on((L as any).Draw.Event.DRAWSTART, this._clearGeometryOnDrawStart);
    this.clustersDataService.getCluster(cluster.id).subscribe((feature) => {
      if (feature.geometry) {
        this.drawnGeometry = feature.geometry;
        this._ms.leafletDrawFeatureGroup.clearLayers();
        const layer = L.geoJSON(feature.geometry);
        layer.eachLayer((l: any) => this._ms.leafletDrawFeatureGroup.addLayer(l));
        this._ms.setGeojsonCoord(feature.geometry);
      }
      const c = feature.properties as any;
      this.creationForm.patchValue({
        geometry: feature.geometry || null,
        properties: {
          name: c.name,
          notes: c.notes || null,
          cd_nom: c.taxref || { cd_nom: c.cd_nom },
          status_id: c.status_id,
          yearly_state_id: c.yearly_state_id,
        },
      });
    });
  }

  private _clearGeometryOnDrawStart = () => {
    if (this.isClusterFormMode) {
      this.drawnGeometry = null;
      this.creationForm.patchValue({ geometry: null });
    }
  }

  exitFormMode() {
    this.clusterCreationMode = false;
    this.editingCluster = null;
    this.pendingObsIdsForCreation = null;
    this.drawnGeometry = null;
    this.creationForm.reset();
    this._ms.map.off((L as any).Draw.Event.DRAWSTART, this._clearGeometryOnDrawStart);
    this._ms.leafletDrawFeatureGroup.clearLayers();
    this.formService.searchForm.controls.geoIntersection.reset();
  }

  saveCluster() {
    if (this.creationForm.invalid) return;
    this.waiting = true;
    const value = JSON.parse(JSON.stringify(this.creationForm.value));
    if (value.properties.cd_nom && typeof value.properties.cd_nom === 'object') {
      value.properties.cd_nom = value.properties.cd_nom.cd_nom;
    }
    if (this.editingCluster) {
      this.clustersDataService.updateCluster(this.editingCluster.id, value).subscribe({
        next: () => {
          this.waiting = false;
          this.toasterService.success('Foyer modifié');
          this.loadClusters();
          this.exitFormMode();
        },
        error: () => {
          this.waiting = false;
          this.toasterService.error('Erreur lors de la modification');
        },
      });
    } else {
      this.clustersDataService.createCluster(value).subscribe({
        next: (data) => {
          this.waiting = false;
          this.toasterService.success('Foyer créé');
          if (this.pendingObsIdsForCreation && this.pendingObsIdsForCreation.length > 0) {
            const obsIds = this.pendingObsIdsForCreation;
            this.pendingObsIdsForCreation = null;
            this.clusters = [...this.clusters, data as Cluster];
            this.updateClusterLayer();
            this.exitFormMode();
            this.onAssociateObservations(obsIds, data.id);
          } else {
            this.loadClusters();
            this.exitFormMode();
          }
        },
        error: () => {
          this.waiting = false;
          this.toasterService.error('Erreur lors de la création');
        },
      });
    }
  }
}
