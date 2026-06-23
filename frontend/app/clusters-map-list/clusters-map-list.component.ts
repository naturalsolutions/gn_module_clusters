import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef, ViewChild, HostListener, TemplateRef } from '@angular/core';
import { NgbTypeaheadSelectItemEvent } from '@ng-bootstrap/ng-bootstrap';
import { UntypedFormBuilder, UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import * as cloneDeep from 'lodash/cloneDeep';
import * as L from 'leaflet';
import buffer from '@turf/buffer';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

import { AuthService } from '@geonature/components/auth/auth.service';
import { ConfigService } from '@geonature/services/config.service';
import { ModuleService } from '@geonature/services/module.service';
import { CruvedStoreService } from '@geonature_common/service/cruved-store.service';
import { MapListService } from '@geonature_common/map-list/map-list.service';
import { MapService } from '@geonature_common/map/map.service';
import { SyntheseFormService } from '@geonature_common/form/synthese-form/synthese-form.service';
import { ClustersObsMapComponent } from './clusters-obs-map/clusters-obs-map.component';

import { ClustersStoreService } from '../services/store.service';
import { ClustersEditWrapperComponent } from '../clusters-edit-wrapper/clusters-edit-wrapper.component';
import { ClustersDataService } from '../services/clusters-data.service';
import { ClustersAssociateModalComponent } from '../clusters-associate-modal/clusters-associate-modal.component';
import { ClustersAssociateObsConflictModalComponent } from '../clusters-associate-obs-conflict-modal/clusters-associate-obs-conflict-modal.component';
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
  public selectedClusterId: number | null = null;
  public selectedObsIds: Set<number> = new Set();
  public selectedObsRowId: number | null = null;
  public obsLoaded = false;
  public clustersLoaded = false;
  public clusterFilter: null | number[] = [];
  public includeOrphanObs = true;
  private pendingSelectClusterId: number | null = null;
  public clustersVisible = true;
  public alsoNonEditableData = true;
  public addObsModulePath: string | null = null;
  public canCreateCluster = false;
  public canUpdateCluster = false;
  public selectedObsForActions: number[] = [];
  public checkedObsSet: Set<number> = new Set();
  public clusterCreationMode = false;
  public editingCluster: Cluster | null = null;
  public creationForm: UntypedFormGroup;
  public waiting = false;
  public users: any[] = [];
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

  private get clusterActionParam(): string {
    return this.alsoNonEditableData ? 'R' : 'U';
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
  private _withClusterSlider: HTMLElement | null = null;
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
    public mapListService: MapListService,
    private modalService: NgbModal,
    private formService: SyntheseFormService,
    private clusterStore: ClustersStoreService,
    private toasterService: ToastrService,
    private route: ActivatedRoute,
    private ngModal: NgbModal,
    private changeDetector: ChangeDetectorRef,
    private router: Router,
    private clustersDataService: ClustersDataService,
    private _ms: MapService,
    private _fb: UntypedFormBuilder,
    private _dfService: DataFormService,
    private authService: AuthService,
    private cruvedStore: CruvedStoreService
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
        manager_id: [null, Validators.required],
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

    const clustersCruved = this.cruvedStore.cruved?.CLUSTERS?.module_objects?.CLUSTERS_CLUSTERS?.cruved;
    this.canCreateCluster = Number(clustersCruved?.C ?? 0) > 0;
    this.canUpdateCluster = Number(clustersCruved?.U ?? 0) > 0;
    if (this.canUpdateCluster) {
      this.alsoNonEditableData = false;
    }

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

    this.subscriptions.push(
      this.router.events
        .pipe(filter((e) => e instanceof NavigationEnd))
        .subscribe(() => {
          const childRoute = this.route.firstChild;
          if (childRoute?.routeConfig?.component === ClustersEditWrapperComponent) {
            const id = Number(childRoute.snapshot.paramMap.get('id_cluster'));
            this._initEditForm({ id } as Cluster);
          } else if (this.editingCluster) {
            this.exitFormMode();
          }
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

    this.subscriptions.push(
      this.clusterStore.selectCluster$.subscribe((clusterId) => {
        const cluster = this.clusters.find((c) => c.id === clusterId);
        if (cluster) {
          this.selectCluster(cluster);
        } else {
          this.pendingSelectClusterId = clusterId;
        }
      })
    );

    this.subscriptions.push(
      this.clusterStore.clusterUpdated$.subscribe((feature) => {
        const cluster = feature.properties as Cluster;
        if (!cluster?.id) return;
        const i = this.clusters.findIndex((c) => c.id === cluster.id);
        if (i !== -1) {
          this.clusters[i] = cluster;
        }
        if (this.clusterFC) {
          const j = this.clusterFC.features.findIndex(
            (f) => (f.properties as any)?.id === cluster.id
          );
          if (j !== -1) {
            this.clusterFC.features[j] = feature as any;
          }
        }
        this.updateClusterLayer();
      })
    );
  }

  ngAfterViewInit() {
    if (this._ms.map) {
      this._ms.map.addLayer(this.clusterFeatureGroup);
      this.obsMap?.bringObservationsToFront();
      this.addObservationControls();
      if (this.canUpdateCluster) {
        this.addNonEditableDataControl();
      }
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
    this.clusterFeatureGroup.clearLayers();

    if (!this.clustersVisible) {
      this.clusterFC = null;
      this.clusters = [];
      this.clustersLoaded = true;
      return;
    }

    const action = this.clusterActionParam;
    const cdNoms = this.acceptedTaxon ? [this.acceptedTaxon.cd_nom] : [];

    this.clustersDataService.listClusters(cdNoms, action).subscribe({
      next: (fc) => {
        this.clusterFC = fc;
        this.clusters = (fc.features || []).map((f) => f.properties as Cluster);
        this.updateClusterLayer();
        this.clustersLoaded = true;
        if (this.pendingSelectClusterId != null) {
          const cluster = this.clusters.find((c) => c.id === this.pendingSelectClusterId);
          if (cluster) {
            this.selectCluster(cluster);
          }
          this.pendingSelectClusterId = null;
        }
      },
      error: () => {
        this.clusterFC = null;
        this.clusters = [];
        this.clustersLoaded = true;
      },
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

  private highlightClusterLayer(clusterId: number, fit = true) {
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
            if (fit) {
              if (layer.getBounds) {
                this._ms.map.fitBounds(layer.getBounds(), { maxZoom: 18 });
              } else if (layer.getLatLng) {
                this._ms.map.setView(layer.getLatLng(), 15);
              }
            }
          }
        });
      }
    });
  }

  private selectCluster(cluster: Cluster, fit = true) {
    this.selectedObsIds = new Set();
    this.selectedObsRowId = null;
    this.selectedClusterId = cluster.id;
    this.obsMap?.clearMapSelection();
    this.highlightClusterLayer(cluster.id, fit);
    this.activeTab = 'clusters';
  }

  onClusterClick(cluster: Cluster) {
    this.selectCluster(cluster);
  }

  onClusterInfo(cluster: Cluster) {
    this.selectCluster(cluster);
    this.router.navigate([`${this.moduleService.currentModule.module_path}/cluster`, cluster.id, 'info', 'details']);
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
      this.selectCluster(cluster, false);
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
    const sources = this.config.CLUSTERS?.SOURCES;
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

    const defaultFilters = { ...this.config.CLUSTERS.DEFAULT_FILTERS };
    const validStatus = this.config?.CLUSTERS?.VALID_STATUS;
    if (validStatus && validStatus.length > 0) {
      defaultFilters['cd_nomenclature_valid_status'] = validStatus;
    }

    this.formService.processDefaultFilters(defaultFilters).subscribe((processedDefaultFilters) => {
      this.formService.searchForm.patchValue(processedDefaultFilters);
      this.formService.processedDefaultFilters = processedDefaultFilters;
      this.changeDetector.detectChanges();

      this.loadData();
    });
  }

  loadData() {
    let formParams = this.formService.formatParams();
    this.lastSearchHadFilters = Object.keys(formParams).some(
      key => key !== 'id_source' && key !== 'id_nomenclature_valid_status'
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

    if (this.config?.CLUSTERS?.VERIFY_OBS_JDD) {
      this._dfService.getDatasets({ module_code: 'CLUSTERS' }).subscribe((datasets) => {
        if (datasets && datasets.length > 0) {
          formParams['id_dataset'] = datasets.map((d) => d.id_dataset);
        } else {
          formParams['id_dataset'] = [-1];
        }
        this._searchObservations(formParams);
      });
    } else {
      this._searchObservations(formParams);
    }
  }

  private _searchObservations(formParams) {
    this.obsLoaded = false;
    this.formService.searchForm.markAsPristine();

    const obs$ = this.alsoNonEditableData
      ? this.clustersDataService.listObservationsSynthese(formParams, this.formService.selectors)
      : this.clustersDataService.listObservations(formParams, this.formService.selectors);

    obs$.subscribe(
      (data) => {
        this.parseGeoJson(data);
        this.obsLoaded = true;
        this.checkPendingAssociate();
      },
      () => {
        this.obsLoaded = true;
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
    this.clusterStore.clearSyntheseData();
    this.clusterStore.setSyntheseData(rawGeojson);
    this.mapListService.idName = 'id_synthese';
    this.mapListService.tableData = [];
    this.noGeomMessage = false;
  }

  private extractIds(observation) {
    if (observation['id_synthese']) {
      const id = observation['id_synthese'];
      if (this.clusterStore.idSyntheseList.has(id) === false) {
        this.clusterStore.idSyntheseList.add(id);
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
    this.clusterStore.clearSyntheseData();
    this.loadData();
  }

  private addNonEditableDataControl() {
    const NonEditableControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create(
          'div',
          'leaflet-bar leaflet-control-custom clusters-mode-control'
        );
        const row = L.DomUtil.create('div', 'clusters-mode-row', container);
        const toggle = L.DomUtil.create('label', 'clusters-mode-toggle', row);
        const checkbox = L.DomUtil.create('input', '', toggle);
        checkbox.type = 'checkbox';
        checkbox.checked = this.alsoNonEditableData;
        L.DomUtil.create('span', 'toggle-slider', toggle);
        const label = L.DomUtil.create('span', 'clusters-mode-label', row);
        label.innerText = 'Voir les données non modifiable';
        L.DomEvent.on(checkbox, 'change', () => {
          this.alsoNonEditableData = checkbox.checked;
          this.loadClusters();
          this.onSearchEvent();
        });
        return container;
      },
    });
    this._ms.map.addControl(new NonEditableControl());
  }

  public updateWithClusterSwitch() {
    if (this._withClusterInput && this._withClusterSlider) {
      const hasItems = Array.isArray(this.clusterFilter) && this.clusterFilter.length > 0;
      this._withClusterInput.checked = this.clusterFilter === null;
      this._withClusterSlider.classList.toggle('indeterminate', hasItems);
    }
  }

  private addObservationControls() {
    const ObsControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create(
          'div',
          'leaflet-bar leaflet-control-custom clusters-mode-control'
        );

        const clustersRow = L.DomUtil.create('div', 'clusters-mode-row', container);
        const clustersToggle = L.DomUtil.create('label', 'clusters-mode-toggle', clustersRow);
        const clustersCheckbox = L.DomUtil.create('input', '', clustersToggle);
        clustersCheckbox.type = 'checkbox';
        clustersCheckbox.checked = this.clustersVisible;
        L.DomUtil.create('span', 'toggle-slider', clustersToggle);
        const clustersLabel = L.DomUtil.create('span', 'clusters-mode-label', clustersRow);
        clustersLabel.innerText = 'Foyers';
        L.DomEvent.on(clustersCheckbox, 'change', () => {
          this.clustersVisible = clustersCheckbox.checked;
          this.loadClusters();
        });

        const orphanRow = L.DomUtil.create('div', 'clusters-mode-row', container);
        const orphanToggle = L.DomUtil.create('label', 'clusters-mode-toggle', orphanRow);
        const orphanCheckbox = L.DomUtil.create('input', '', orphanToggle);
        orphanCheckbox.type = 'checkbox';
        orphanCheckbox.checked = this.includeOrphanObs;
        L.DomUtil.create('span', 'toggle-slider', orphanToggle);
        const orphanLabel = L.DomUtil.create('span', 'clusters-mode-label', orphanRow);
        orphanLabel.innerText = 'Observations sans foyer';
        L.DomEvent.on(orphanCheckbox, 'change', () => {
          this.includeOrphanObs = orphanCheckbox.checked;
          this.onSearchEvent();
        });

        const withClusterRow = L.DomUtil.create('div', 'clusters-mode-row', container);
        const withClusterToggle = L.DomUtil.create('label', 'clusters-mode-toggle', withClusterRow);
        const withClusterCheckbox = L.DomUtil.create('input', '', withClusterToggle);
        withClusterCheckbox.type = 'checkbox';
        this._withClusterInput = withClusterCheckbox;
        this._withClusterSlider = L.DomUtil.create('span', 'toggle-slider', withClusterToggle);
        this.updateWithClusterSwitch();
        const withClusterLabel = L.DomUtil.create('span', 'clusters-mode-label', withClusterRow);
        withClusterLabel.innerText = 'Observations avec foyer';
        L.DomEvent.on(withClusterCheckbox, 'change', () => {
          if (Array.isArray(this.clusterFilter) && this.clusterFilter.length > 0) {
            this.clusterFilter = [];
          } else {
            this.clusterFilter = withClusterCheckbox.checked ? null : [];
          }
          this.updateWithClusterSwitch();
          this.onSearchEvent();
        });

        return container;
      },
    });
    this._ms.map.addControl(new ObsControl());
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
    // Get the current cluster ID if only one observation is selected (to show as currently associated)
    let currentClusterId: number | null = null;
    if (obsIds.length === 1) {
      const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsIds[0]);
      currentClusterId = obs?.cluster_id ?? null;
    }

    // Collect all unique taxon codes from selected observations
    // This is used to filter available clusters to compatible taxa
    const cdNomsSet = new Set<number>();
    for (const obsId of obsIds) {
      const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsId);
      if (obs?.cd_nom) cdNomsSet.add(obs.cd_nom);
    }

    // Load compatible clusters for the selected observations' taxa
    this.clustersDataService.listClusters(Array.from(cdNomsSet), 'U').subscribe((fc) => {
      const clusters = (fc.features || []).map((f) => f.properties as Cluster);

      // Open association modal to let user select target cluster or create new one
      const modalRef = this.modalService.open(ClustersAssociateModalComponent, { size: 'lg' });
      modalRef.componentInstance.clusters = clusters;
      modalRef.componentInstance.observationIds = obsIds;
      modalRef.componentInstance.currentClusterId = currentClusterId;
      modalRef.componentInstance.preselectedClusterId = preselectedClusterId ?? null;
      modalRef.componentInstance.createCluster = () => this.onCreateCluster(obsIds);

      // Handle modal result (user selection)
      modalRef.result.then(
        (result: { clusterId: number | null; obsIds: number[] }) => {
          // Build requests to add/remove observations from clusters
          const requests = result.obsIds
            .map((obsId) => {
              if (result.clusterId != null) {
                // Add observation to selected cluster
                return this.clustersDataService.addObservation(result.clusterId, obsId);
              }
              // Remove observation from its current cluster (if any)
              const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsId);
              if (obs?.cluster_id != null) {
                return this.clustersDataService.removeObservation(obs.cluster_id, obsId);
              }
              return null;
            })
            .filter(Boolean);

          // Execute all requests in parallel
          forkJoin(requests).subscribe({
            next: () => {
              // Update local data on success
              for (const obsId of result.obsIds) {
                const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsId);
                if (obs) {
                  obs.cluster_id = result.clusterId;
                }
              }
              this.mapListService.tableData = [...this.mapListService.tableData];
              const suffix =
                result.clusterId == null ? 'retirée(s) du foyer' : 'associée(s) au foyer';
              this.toasterService.success(`${result.obsIds.length} observation(s) ${suffix}`);
            },
            error: (error) => {
              // Handle conflict error: observation is outside cluster geometry bounds
              if (error.status === 409 && error.error?.reason === 'obs_outside_cluster_geom') {
                // Open conflict modal to let user decide: extend cluster geometry or cancel
                const conflictModalRef = this.modalService.open(ClustersAssociateObsConflictModalComponent);
                conflictModalRef.result.then(
                  (conflictResult) => {
                    if (conflictResult === 'extend' && result.clusterId != null) {
                      // User chose to extend cluster geometry - retry with extends_cluster option
                      const requestsWithExtend = result.obsIds
                        .map((obsId) => {
                          return this.clustersDataService.addObservation(result.clusterId, obsId, { extendsCluster: true });
                        })
                        .filter(Boolean);

                      // Execute requests with geometry extension
                      forkJoin(requestsWithExtend).subscribe({
                        next: () => {
                          // Update local data on success
                          for (const obsId of result.obsIds) {
                            const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsId);
                            if (obs) {
                              obs.cluster_id = result.clusterId;
                            }
                          }
                          this.mapListService.tableData = [...this.mapListService.tableData];
                          this.toasterService.success(`${result.obsIds.length} observation(s) associée(s) au foyer (étendu)`);
                        },
                      });
                    }
                    // If user chose not to extend, do nothing (cancel)
                  },
                  () => {
                    // Modal dismissed without action
                  }
                );
              }
            },
          });
        },
        () => {
          // Association modal dismissed without selection
        }
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
    if (this.pendingAssociate) {
      const { clusterId, obsIds } = this.pendingAssociate;
      this.pendingAssociate = null;
      this.onAssociateObservations(obsIds, clusterId);
    }
  }

  /**
   * Initialize cluster creation form with optional observation context
   * If called with a single observation, pre-populates the form with:
   * - Taxon code from the observation
   * - Buffered geometry around the observation location as starting point
   */
  onCreateCluster(obsIds?: number[]) {
    // Store observation IDs to associate after cluster creation
    this.pendingObsIdsForCreation = obsIds || null;
    let predrawnGeometry: GeoJSON.Geometry | null = null;

    // If called with a single observation, try to pre-populate cluster with buffered geometry
    if (obsIds && obsIds.length > 0 && obsIds.length === 1) {
      const obs = this.mapListService.tableData.find((o) => o.id_synthese === obsIds[0]);
      if (obs?.cd_nom) {
        // Find the observation's geometry from the GeoJSON feature collection
        let geometry: GeoJSON.Geometry | null = null;

        const geoJsonData = this.mapListService.geojsonData as GeoJSON.FeatureCollection | undefined;
        if (geoJsonData?.features) {
          const feature = geoJsonData.features.find((f: any) => {
            return f.properties?.observations?.id_synthese?.includes(obsIds[0]);
          });
          if (feature?.geometry) {
            geometry = feature.geometry;
          }
        }

        // If geometry found, buffer it to create a pre-drawn cluster geometry
        // This gives the user a starting point for the cluster boundary
        if (geometry) {
          try {
            const bufferSize = this.config?.CLUSTERS?.OBS_BUFFER_SIZE ?? 15;
            const geoJsonFeature = { type: 'Feature' as const, geometry: geometry, properties: {} };
            // Buffer the observation point/geometry by the configured buffer size (in meters)
            const bufferedFeature = buffer(geoJsonFeature, bufferSize, { units: 'meters', steps: 2 });
            predrawnGeometry = bufferedFeature.geometry;
          } catch (error) {
            console.error('Error buffering observation geometry:', error);
            // Fall back to no pre-drawn geometry if buffering fails
          }
        }
        // Set the taxon code and pre-drawn geometry for the form
        this.enterDrawingMode(obs.cd_nom, predrawnGeometry);
        return;
      }
    }
    // If no observation or multiple observations, start with empty form
    this.enterDrawingMode(undefined, predrawnGeometry);
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
    if (this.editingCluster) {
      this.router.navigateByUrl(`/${basePath}`).then(() => {
        this.router.navigate([`/${basePath}/occurrence`, idSynthese, 'details']);
      });
    } else {
      this.router.navigate([`/${basePath}/occurrence`, idSynthese, 'details']);
    }
  }

  onToggleSearchBar() {
    if (this.isSearchBarReduced && this.isClusterFormMode) {
      this.exitFormMode();
    }
    this.isSearchBarReduced = !this.isSearchBarReduced;
  }

  /**
   * Enter cluster creation/drawing mode
   * Sets up the form and map for creating a new cluster
   * @param cdNom Optional taxon code to pre-populate the form
   * @param predrawnGeometry Optional pre-drawn geometry (e.g., from buffered observation)
   */
  private _loadRoles(callback: () => void) {
    if (this.users.length > 0) {
      callback();
      return;
    }
    this.clustersDataService.getRoles().subscribe((data) => {
      this.users = data;
      callback();
    });
  }

  enterDrawingMode(cdNom?: number, predrawnGeometry?: GeoJSON.Geometry) {
    this.clusterCreationMode = true;
    this.editingCluster = null;
    this.isSearchBarReduced = true;
    this.activeTab = 'clusters';
    this.drawnGeometry = predrawnGeometry || null;

    if (!predrawnGeometry) {
      this.creationForm.reset();
    }

    this._loadRoles(() => {
      const currentUserId = Number(this.authService.getCurrentUser().id_role);
      const currentUserInList = this.users.some((u) => Number(u.id_role) === currentUserId);
      let defaultManagerId = null;
      if (currentUserInList) {
        defaultManagerId = currentUserId;
      } else if (this.users.length === 1) {
        defaultManagerId = Number(this.users[0].id_role);
      }

      this.creationForm.patchValue({
        geometry: predrawnGeometry || null,
        properties: {
          manager_id: defaultManagerId,
        },
      });

      const geometryControl = this.creationForm.get('geometry');
      if (geometryControl) {
        geometryControl.setValue(predrawnGeometry, { emitEvent: true });
        geometryControl.markAsTouched();
        geometryControl.markAsDirty();
        geometryControl.updateValueAndValidity();
      }
      this.creationForm.updateValueAndValidity();
    });

    // If pre-drawn geometry provided, render it on the map as starting point
    if (predrawnGeometry) {
      this._ms.leafletDrawFeatureGroup.clearLayers();
      const layer = L.geoJSON(predrawnGeometry);
      layer.eachLayer((l: any) => {
        this._ms.leafletDrawFeatureGroup.addLayer(l);
      });
      // Note: Don't call setGeojsonCoord for pre-drawn geometry as it causes form validation issues
    }

    // If taxon code provided, load and set the full taxon object
    if (cdNom) {
      this._dfService.getTaxonInfo(cdNom).subscribe((taxon) => {
        this.creationForm.patchValue({ properties: { cd_nom: taxon } });
        // Ensure form validity is updated after taxon is loaded
        const geometryControl = this.creationForm.get('geometry');
        const propertiesGroup = this.creationForm.get('properties');
        if (geometryControl) {
          geometryControl.updateValueAndValidity();
        }
        if (propertiesGroup) {
          propertiesGroup.updateValueAndValidity();
        }
        this.creationForm.updateValueAndValidity();
      });
    }

    // Enable map drawing interaction
    this._ms.map.on((L as any).Draw.Event.DRAWSTART, this._clearGeometryOnDrawStart);
  }

  navigateToEdit(cluster: Cluster) {
    this.router.navigate([
      `/${this.moduleService.currentModule.module_path}/cluster`,
      cluster.id,
      'edit',
    ]);
  }

  private _initEditForm(cluster: Cluster) {
    this.clusterCreationMode = false;
    this.editingCluster = cluster;
    this.isSearchBarReduced = true;
    this.activeTab = 'clusters';
    this.drawnGeometry = null;
    this.creationForm.reset();
    this._ms.map.on((L as any).Draw.Event.DRAWSTART, this._clearGeometryOnDrawStart);
    const feature = this.clusterFC?.features?.find((f) => f.properties?.id === cluster.id);
    if (feature?.geometry) {
      this.drawnGeometry = feature.geometry;
      this._ms.leafletDrawFeatureGroup.clearLayers();
      const layer = L.geoJSON(feature.geometry);
      layer.eachLayer((l: any) => this._ms.leafletDrawFeatureGroup.addLayer(l));
      this._ms.setGeojsonCoord(feature.geometry);
    }
    const props = (feature?.properties || {}) as any;
    this.creationForm.patchValue({
      geometry: feature?.geometry || null,
      properties: {
        name: props.name,
        notes: props.notes || null,
        cd_nom: props.taxref || { cd_nom: props.cd_nom },
        status_id: props.status_id,
        yearly_state_id: props.yearly_state_id,
        manager_id: props.manager_id,
      },
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

  cancelFormMode() {
    const wasEditing = this.editingCluster !== null;
    this.exitFormMode();
    if (wasEditing) {
      this.router.navigateByUrl(`/${this.moduleService.currentModule.module_path}`);
    }
  }

  saveCluster() {
    if (this.creationForm.invalid) return;
    this.waiting = true;
    const value = JSON.parse(JSON.stringify(this.creationForm.value));
    if (value.properties.cd_nom && typeof value.properties.cd_nom === 'object') {
      value.properties.cd_nom = value.properties.cd_nom.cd_nom;
    }
    const moduleUrl = `/${this.moduleService.currentModule.module_path}`;
    if (this.editingCluster) {
      this.clustersDataService.updateCluster(this.editingCluster.id, value).subscribe({
        next: () => {
          this.waiting = false;
          this.toasterService.success('Foyer modifié');
          this.loadClusters();
          this.exitFormMode();
          this.router.navigateByUrl(moduleUrl);
        },
        error: () => {
          this.waiting = false;
        },
      });
    } else {
      this.clustersDataService.createCluster(value).subscribe({
        next: (feature: GeoJSON.Feature) => {
          this.waiting = false;
          this.toasterService.success('Foyer créé');
          if (this.pendingObsIdsForCreation && this.pendingObsIdsForCreation.length > 0) {
            const obsIds = this.pendingObsIdsForCreation;
            const clusterId = (feature.properties as Cluster).id;
            this.pendingObsIdsForCreation = null;
            this.loadClusters();
            this.exitFormMode();
            this.router.navigateByUrl(moduleUrl);
            this.onAssociateObservations(obsIds, clusterId);
          } else {
            this.loadClusters();
            this.exitFormMode();
            this.router.navigateByUrl(moduleUrl);
          }
        },
        error: () => {
          this.waiting = false;
        },
      });
    }
  }
}
