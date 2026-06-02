import { Injectable } from '@angular/core';
import { ConfigService } from '@geonature/services/config.service';
import * as L from 'leaflet';

@Injectable({ providedIn: 'root' })
export class ObservationLayerService {
  constructor(private config: ConfigService) {}

  createGroup(): L.LayerGroup {
    return this.config.CLUSTERS?.ENABLE_LEAFLET_CLUSTER
      ? (L as any).markerClusterGroup({
          iconCreateFunction: this.clusterIcon,
        })
      : new L.FeatureGroup();
  }

  buildGeoJsonLayer(
    geojson: any,
    onEachFeature?: (feature: any, layer: L.Layer) => void,
    pointToLayer?: (feature: any, latlng: L.LatLng) => L.Layer
  ): L.GeoJSON {
    return L.geoJSON(geojson, {
      pointToLayer: pointToLayer || this.defaultPointToLayer.bind(this),
      onEachFeature,
    });
  }

  private defaultPointToLayer(feature, latlng) {
    const ids = feature.properties.observations?.id_synthese || [];
    const countObs = ids.length;
    const marker = L.circleMarker(latlng, {
      color: '#3388FF',
      weight: 2,
      fillColor: '#3388FF',
      fillOpacity: 0.4,
      radius: 8,
    });
    (marker as any).nb_obs = countObs;
    marker.bindTooltip(`${countObs}`, {
      permanent: true,
      direction: 'center',
      offset: L.point({ x: 0, y: 0 }),
      className: 'number-obs',
    });
    return marker;
  }

  private clusterIcon(cluster) {
    const obsChildCount = cluster
      .getAllChildMarkers()
      .map((layer) => (layer as any).nb_obs)
      .reduce((previous, next) => previous + next);
    const clusterSize =
      obsChildCount > 100 ? 'large' : obsChildCount > 10 ? 'medium' : 'small';
    return L.divIcon({
      html: `<div><span>${obsChildCount}</span></div>`,
      className: `marker-cluster marker-cluster-${clusterSize}`,
      iconSize: L.point(40, 40),
    });
  }
}
