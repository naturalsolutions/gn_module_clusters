import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ConfigService } from '@geonature/services/config.service';
import { Observable } from 'rxjs';
import { Cluster, ClusterFeature } from '../models';

const GEOJSON_CONTENT_TYPE = new HttpHeaders({ 'Content-Type': 'application/geo+json' });
const GEOJSON_ACCEPT = new HttpHeaders({ 'Accept': 'application/geo+json' });

@Injectable()
export class ClustersDataService {
  private CLUSTERS_API: string;

  constructor(
    private _http: HttpClient,
    public config: ConfigService
  ) {
    this.CLUSTERS_API = `${this.config.API_ENDPOINT}/clusters`;
  }

  listClusters(cdNoms: number[] = [], action: string = 'R'): Observable<GeoJSON.FeatureCollection> {
    let params = new HttpParams()
      .set('observations_count', '1')
      .set('action', action);
    if (cdNoms.length > 0) {
      params = params.set('accepted_cd_nom', cdNoms.join(','));
    }
    return this._http.get<GeoJSON.FeatureCollection>(`${this.CLUSTERS_API}/`, {
      headers: GEOJSON_ACCEPT,
      params,
    });
  }

  getCluster(id: number): Observable<GeoJSON.Feature> {
    return this._http.get<GeoJSON.Feature>(`${this.CLUSTERS_API}/${id}`, {
      headers: GEOJSON_ACCEPT,
    });
  }

  createCluster(feature: ClusterFeature): Observable<Cluster> {
    return this._http.post<Cluster>(`${this.CLUSTERS_API}/`, feature, {
      headers: GEOJSON_CONTENT_TYPE,
    });
  }

  updateCluster(id: number, feature: ClusterFeature): Observable<Cluster> {
    return this._http.post<Cluster>(`${this.CLUSTERS_API}/${id}`, feature, {
      headers: GEOJSON_CONTENT_TYPE,
    });
  }

  deleteCluster(id: number): Observable<void> {
    return this._http.delete<void>(`${this.CLUSTERS_API}/${id}`);
  }

  addObservation(idCluster: number, idObservation: number): Observable<void> {
    return this._http.post<void>(
      `${this.CLUSTERS_API}/${idCluster}/observations/${idObservation}`,
      null
    );
  }

  removeObservation(idCluster: number, idObservation: number): Observable<void> {
    return this._http.delete<void>(
      `${this.CLUSTERS_API}/${idCluster}/observations/${idObservation}`
    );
  }

  getRoles(): Observable<any[]> {
    return this._http.post<any[]>(`${this.CLUSTERS_API}/roles`, null);
  }

  listObservations(filters: any, selectors: HttpParams): Observable<any> {
    return this._http.post<any>(`${this.CLUSTERS_API}/observations`, filters, {
      params: selectors,
    });
  }

  exportPdf(id: number, filters?: any): Observable<Blob> {
    return this._http.post(`${this.CLUSTERS_API}/${id}/export_pdf`, { filters }, {
      responseType: 'blob',
    });
  }
}
