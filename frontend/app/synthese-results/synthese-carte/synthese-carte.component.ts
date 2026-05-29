import {
  Component,
  OnInit,
  Input,
  AfterViewInit,
  OnChanges,
  OnDestroy,
} from '@angular/core';
import { GeoJSON } from 'leaflet';
import { MapListService } from '@geonature_common/map-list/map-list.service';
import { MapService } from '@geonature_common/map/map.service';
import { leafletDrawOption } from '@geonature_common/map/leaflet-draw.options';
import { SyntheseFormService } from '@geonature_common/form/synthese-form/synthese-form.service';
import { CommonService } from '@geonature_common/service/common.service';
import * as L from 'leaflet';
import { ConfigService } from '@geonature/services/config.service';

@Component({
  selector: 'pnx-synthese-carte',
  templateUrl: 'synthese-carte.component.html',
  styleUrls: ['synthese-carte.component.scss'],
  providers: [],
})
export class SyntheseCarteComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  public leafletDrawOptions = leafletDrawOption;
  public currentLeafletDrawCoord: any;
  public firstFileLayerMessage = true;
  public SYNTHESE_CONFIG = null;
  public cluserOrSimpleFeatureGroup = null;

  public selectedLayers: Array<L.Layer> = [];
  public layersDict: object = {};

  private originDefaultStyle = {
    color: '#3388FF',
    weight: 3,
    fill: false,
  };
  private selectedDefaultStyle = {
    color: '#FF0000',
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

  constructor(
    public mapListService: MapListService,
    private _ms: MapService,
    public formService: SyntheseFormService,
    private _commonService: CommonService,
    public config: ConfigService
  ) {
    this.SYNTHESE_CONFIG = this.config.SYNTHESE;
    this.cluserOrSimpleFeatureGroup = this.config.SYNTHESE.ENABLE_LEAFLET_CLUSTER
      ? (L as any).markerClusterGroup()
      : new L.FeatureGroup();
  }

  ngOnInit() {
    this.leafletDrawOptions.draw.rectangle = true;
    this.leafletDrawOptions.draw.circle = true;
    this.leafletDrawOptions.draw.polyline = false;
    this.leafletDrawOptions.edit.remove = true;
    this.formService.searchForm.patchValue({ format: 'grouped_geom' });
  }

  ngOnDestroy() {}

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

    this.cluserOrSimpleFeatureGroup.addTo(this._ms.map);
  }

  layerDictCache(idSyntheseList, layer) {
    for (let id of idSyntheseList) {
      id in this.layersDict ? this.layersDict[id].push(layer) : (this.layersDict[id] = [layer]);
    }
  }

  layerEvent(feature, layer, idSyntheseIds) {
    layer.on({
      click: (e) => {
        this.toggleStyleFromMap(feature, layer);
        this.mapListService.mapSelected.next(idSyntheseIds);
      },
    });
  }

  onEachFeature(feature, layer) {
    this.layerDictCache(feature.properties.observations.id_synthese, layer);
    this.layerEvent(feature, layer, feature.properties.observations.id_synthese);
  }

  clusterCountOverrideFn(cluster) {
    const obsChildCount = cluster
      .getAllChildMarkers()
      .map((layer) => {
        return layer.nb_obs;
      })
      .reduce((previous, next) => previous + next);
    const clusterSize = obsChildCount > 100 ? 'large' : obsChildCount > 10 ? 'medium' : 'small';
    return L.divIcon({
      html: `<div><span>${obsChildCount}</span></div>`,
      className: `marker-cluster marker-cluster-${clusterSize}`,
      iconSize: L.point(40, 40),
    });
  }

  ngOnChanges(change) {
    this.layersDict = {};
    if (this._ms.map) {
      this._ms.map.removeLayer(this.cluserOrSimpleFeatureGroup);
    }
    if (change && change.inputSyntheseData.currentValue) {
      this.cluserOrSimpleFeatureGroup = this.config.SYNTHESE.ENABLE_LEAFLET_CLUSTER
        ? (L as any).markerClusterGroup({
            iconCreateFunction: this.clusterCountOverrideFn,
          })
        : new L.FeatureGroup();
      const geojsonLayer = new L.GeoJSON(change.inputSyntheseData.currentValue, {
        pointToLayer: (feature, latlng) => {
          const circleMarker = L.circleMarker(latlng);
          let countObs = feature.properties.observations.id_synthese.length;
          (circleMarker as any).nb_obs = countObs;
          circleMarker.bindTooltip(`${countObs}`, {
            permanent: true,
            direction: 'center',
            offset: L.point({ x: 0, y: 0 }),
            className: 'number-obs',
          });
          return circleMarker;
        },
        onEachFeature: this.onEachFeature.bind(this),
      });
      this.cluserOrSimpleFeatureGroup.addLayer(geojsonLayer);
      this._ms.map.addLayer(this.cluserOrSimpleFeatureGroup);
      if (change.inputSyntheseData.previousValue !== undefined) {
        try {
          this._ms.map.fitBounds(this.cluserOrSimpleFeatureGroup.getBounds());
        } catch (error) {}
      }
    }
  }

  toggleStyleFromMap(feature, layer) {
    if (this.selectedLayers.length > 0) {
      this.selectedLayers.forEach((layer) => {
        (layer as L.GeoJSON).setStyle(this.originDefaultStyle);
      });
    }
    layer.setStyle(this.selectedDefaultStyle);
    this.selectedLayers = [layer];
  }

  private toggleStyleFromList(currentSelectedLayers) {
    if (this.selectedLayers.length > 0) {
      this.selectedLayers.forEach((layer) => {
        (layer as L.GeoJSON).setStyle(this.originDefaultStyle);
      });
    }
    this.selectedLayers = currentSelectedLayers;
    this.selectedLayers.forEach((layer) => {
      (layer as L.GeoJSON).setStyle(this.selectedDefaultStyle);
    });
  }

  public clearMapSelection() {
    if (this.selectedLayers.length > 0) {
      this.selectedLayers.forEach((layer) => {
        (layer as L.GeoJSON).setStyle(this.originDefaultStyle);
      });
    }
    this.selectedLayers = [];
  }

  bindGeojsonForm(geojson) {
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
