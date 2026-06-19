import {
  Component,
  OnInit,
  Input,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { GeoJSON } from 'leaflet';
import { MapListService } from '@geonature_common/map-list/map-list.service';
import { MapService } from '@geonature_common/map/map.service';
import { leafletDrawOption } from '@geonature_common/map/leaflet-draw.options';
import { SyntheseFormService } from '@geonature_common/form/synthese-form/synthese-form.service';
import { CommonService } from '@geonature_common/service/common.service';
import * as L from 'leaflet';
import { ConfigService } from '@geonature/services/config.service';
import { ObservationLayerService } from '../../services/observation-layer.service';

@Component({
  selector: 'pnx-clusters-obs-map',
  templateUrl: 'clusters-obs-map.component.html',
  styleUrls: ['clusters-obs-map.component.scss'],
  providers: [],
})
export class ClustersObsMapComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  public leafletDrawOptions = leafletDrawOption;
  public currentLeafletDrawCoord: any;
  public firstFileLayerMessage = true;
  public cluserOrSimpleFeatureGroup = null;

  public selectedLayers: Array<L.Layer> = [];
  public layersDict: object = {};

  private originDefaultStyle: L.CircleMarkerOptions = {
    color: '#3388FF',
    weight: 3,
    fill: false,
    radius: 10,
  };
  private selectedDefaultStyle: L.CircleMarkerOptions = {
    color: '#28A745',
    weight: 3,
    fill: false,
    radius: 10,
  };
  private checkedOnlyStyle: L.CircleMarkerOptions = {
    color: '#3388FF',
    fillColor: '#90CAF9',
    fillOpacity: 1,
    fill: true,
    weight: 2,
    radius: 10,
  };
  private checkedSelectedStyle: L.CircleMarkerOptions = {
    color: '#28A745',
    fillColor: '#90CAF9',
    fillOpacity: 1,
    fill: true,
    weight: 3,
    radius: 10,
  };

  private defaultIcon = new L.Icon({
    iconUrl: 'assets/images/default_marker.png',
    iconSize: [28, 38],
    shadowUrl: 'assets/images/marker-shadow.png',
    shadowAnchor: [8, 15],
    shadowSize: [25, 18],
    iconAnchor: [14, 38],
  });

  private selectedIcon = new L.Icon({
    iconUrl: 'assets/images/selected_marker.png',
    iconSize: [28, 38],
    shadowUrl: 'assets/images/marker-shadow.png',
    shadowAnchor: [8, 15],
    shadowSize: [25, 18],
    iconAnchor: [14, 38],
  });

  @Input() inputSyntheseData: GeoJSON;
  @Input() drawEnabled = true;
  @Input() isClusterFormMode = false;
  @Input() skipFitBounds = false;
  public checkedObsIds: Set<number> = new Set();

  constructor(
    public mapListService: MapListService,
    private _ms: MapService,
    public formService: SyntheseFormService,
    private _commonService: CommonService,
    public config: ConfigService,
    private obsLayerService: ObservationLayerService
  ) {
    this.cluserOrSimpleFeatureGroup = this.obsLayerService.createGroup();
  }

  ngOnInit() {
    this.leafletDrawOptions.draw.rectangle = true;
    this.leafletDrawOptions.draw.circle = !this.isClusterFormMode;
    this.leafletDrawOptions.draw.polyline = false;
    this.leafletDrawOptions.edit.remove = true;
    this.formService.searchForm.patchValue({ format: 'grouped_geom' });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.isClusterFormMode) {
    this.leafletDrawOptions.draw.circle = !this.isClusterFormMode;
      setTimeout(() => {
        const circles = document.querySelectorAll('.leaflet-draw-draw-circle');
        circles.forEach((el: HTMLElement) => {
          el.style.display = this.isClusterFormMode ? 'none' : '';
        });
      });
    }
    if (changes.inputSyntheseData && changes.inputSyntheseData.currentValue) {
      this.layersDict = {};
      if (this._ms.map) {
        this._ms.map.removeLayer(this.cluserOrSimpleFeatureGroup);
      }
      this.cluserOrSimpleFeatureGroup = this.obsLayerService.createGroup();
      const geojsonLayer = this.obsLayerService.buildGeoJsonLayer(
        changes.inputSyntheseData.currentValue,
        (feature, layer) => this.onEachFeature(feature, layer),
        (feature, latlng) => {
          const circleMarker = L.circleMarker(latlng);
          let countObs = feature.properties.observations.id_synthese.length;
          (circleMarker as any).nb_obs = countObs;
          circleMarker.setStyle(this.originDefaultStyle);
          circleMarker.bindTooltip(`${countObs}`, {
            permanent: true,
            direction: 'center',
            offset: L.point({ x: 0, y: 0 }),
            className: 'number-obs',
          });
          return circleMarker;
        }
      );
      this.cluserOrSimpleFeatureGroup.addLayer(geojsonLayer);
      this._ms.map.addLayer(this.cluserOrSimpleFeatureGroup);
      if (changes.inputSyntheseData.previousValue !== undefined && !this.skipFitBounds) {
        try {
          this._ms.map.fitBounds(this.cluserOrSimpleFeatureGroup.getBounds());
        } catch (error) {}
      }
    }
  }

  ngOnDestroy() {}

  public bringObservationsToFront() {
    if (this.cluserOrSimpleFeatureGroup) {
      this.cluserOrSimpleFeatureGroup.bringToFront();
    }
  }

  ngAfterViewInit() {
    this.mapListService.onTableClick$.subscribe((id) => {
      const selectedLayers = this.layersDict[id];
      if (selectedLayers) {
        this.toggleStyleFromList(selectedLayers);
        const tempFeatureGroup = new L.FeatureGroup();
        selectedLayers.forEach((layer) => {
          tempFeatureGroup.addLayer(layer);
        });
        this._ms.map.fitBounds(tempFeatureGroup.getBounds(), { maxZoom: 18 });
      }
    });
  }

  private onEachFeature(feature, layer) {
    layer.id = feature.properties.observations.id_synthese;
    this.cluserOrSimpleFeatureGroup.addLayer(layer);
    this.layerDictCache(feature.properties.observations.id_synthese, layer);
    this.layerEvent(feature, layer, feature.properties.observations.id_synthese);
  }

  private layerDictCache(idSyntheseList, layer) {
    for (const id of idSyntheseList) {
      id in this.layersDict
        ? this.layersDict[id].push(layer)
        : (this.layersDict[id] = [layer]);
    }
  }

  private layerEvent(feature, layer, idSyntheseIds) {
    layer.on({
      click: () => {
        this.toggleStyleFromMap(feature, layer);
        this.mapListService.mapSelected.next(idSyntheseIds);
      },
    });
  }

  public updateCheckedObsIds(ids: Set<number>) {
    this.checkedObsIds = ids;
    this.updateCheckedStyle();
  }

  private getLayerStyle(layer: L.CircleMarker): L.CircleMarkerOptions {
    const isSelected = this.selectedLayers.includes(layer);
    const isChecked = this.isLayerChecked(layer);
    if (isChecked && isSelected) return this.checkedSelectedStyle;
    if (isChecked) return this.checkedOnlyStyle;
    if (isSelected) return this.selectedDefaultStyle;
    return this.originDefaultStyle;
  }

  private isLayerChecked(layer: L.CircleMarker): boolean {
    if (this.checkedObsIds.size === 0) return false;
    for (const id in this.layersDict) {
      const layers = this.layersDict[id];
      if (layers.includes(layer) && this.checkedObsIds.has(Number(id))) {
        return true;
      }
    }
    return false;
  }

  private applyLayerStyle(layer: L.CircleMarker) {
    (layer as L.CircleMarker).setStyle(this.getLayerStyle(layer));
  }

  private updateCheckedStyle() {
    for (const id in this.layersDict) {
      const layers = this.layersDict[id];
      for (const layer of layers) {
        this.applyLayerStyle(layer as L.CircleMarker);
      }
    }
  }

  toggleStyleFromMap(feature, layer) {
    const oldSelected = [...this.selectedLayers];
    this.selectedLayers = [layer];
    oldSelected.forEach((l) => {
      this.applyLayerStyle(l as L.CircleMarker);
    });
    this.applyLayerStyle(layer);
  }

  private toggleStyleFromList(currentSelectedLayers) {
    const oldSelected = [...this.selectedLayers];
    this.selectedLayers = currentSelectedLayers;
    oldSelected.forEach((l) => {
      this.applyLayerStyle(l as L.CircleMarker);
    });
    this.selectedLayers.forEach((l) => {
      this.applyLayerStyle(l as L.CircleMarker);
    });
  }

  public clearMapSelection() {
    const oldSelected = [...this.selectedLayers];
    this.selectedLayers = [];
    oldSelected.forEach((l) => {
      this.applyLayerStyle(l as L.CircleMarker);
    });
  }

  bindGeojsonForm(geojson) {
    if (this.isClusterFormMode) return;
    this.formService.searchForm.controls.geoIntersection.setValue(geojson);
    this.currentLeafletDrawCoord = geojson;
  }

  onFileLayerLoaded(geojson) {
    this.formService.searchForm.controls.geoIntersection.setValue(geojson);
    if (this.firstFileLayerMessage) {
      this._commonService.translateToaster('success', 'Map.Messages.FileLayerInfoSynthese');
    }
    this.firstFileLayerMessage = false;
  }

  deleteControlValue() {
    this.formService.searchForm.controls.geoIntersection.reset();
  }
}
