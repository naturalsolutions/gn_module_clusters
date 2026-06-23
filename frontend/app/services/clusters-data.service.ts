import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ConfigService } from '@geonature/services/config.service';
import { Observable } from 'rxjs';
import { Cluster, ClusterFeature, Intervention } from '../models';

const GEOJSON_CONTENT_TYPE = new HttpHeaders({ 'Content-Type': 'application/geo+json' });
const GEOJSON_ACCEPT = new HttpHeaders({ 'Accept': 'application/geo+json, application/json' });

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

  getClusterUrl(id: number): string {
    return `${this.CLUSTERS_API}/${id}`;
  }

  getCluster(id: number, include?: { surface?: boolean; bbox?: boolean; interventions?: boolean; observations?: boolean }): Observable<GeoJSON.Feature> {
    let params = new HttpParams();
    if (include?.surface !== false) params = params.set('surface', '1');
    if (include?.bbox) params = params.set('bbox', '1');
    if (include?.interventions !== false) params = params.set('interventions', '1');
    if (include?.observations !== false) params = params.set('observations', '1');
    return this._http.get<GeoJSON.Feature>(this.getClusterUrl(id), {
      headers: GEOJSON_ACCEPT,
      params,
    });
  }

  createCluster(feature: ClusterFeature): Observable<GeoJSON.Feature> {
    return this._http.post<GeoJSON.Feature>(`${this.CLUSTERS_API}/`, feature, {
      headers: GEOJSON_ACCEPT.set('Content-Type', 'application/geo+json'),
    });
  }

  updateCluster(id: number, feature: ClusterFeature): Observable<GeoJSON.Feature> {
    return this._http.post<GeoJSON.Feature>(`${this.CLUSTERS_API}/${id}`, feature, {
      headers: GEOJSON_ACCEPT.set('Content-Type', 'application/geo+json'),
    });
  }

  deleteCluster(id: number): Observable<void> {
    return this._http.delete<void>(`${this.CLUSTERS_API}/${id}`);
  }

  addObservation(idCluster: number, idObservation: number, options?: { extendsCluster?: boolean }): Observable<GeoJSON.Feature> {
    let params = new HttpParams();
    if (options?.extendsCluster) {
      params = params.set('extends_cluster', '1');
    }
    return this._http.post<GeoJSON.Feature>(
      `${this.CLUSTERS_API}/${idCluster}/observations/${idObservation}`,
      null,
      { params, headers: { 'not-to-handle': 'true', 'Accept': 'application/json, application/geo+json' } },
    );
  }

  removeObservation(idCluster: number, idObservation: number): Observable<void> {
    return this._http.delete<void>(
      `${this.CLUSTERS_API}/${idCluster}/observations/${idObservation}`
    );
  }

  getRoles(): Observable<any[]> {
    return this._http.get<any[]>(`${this.CLUSTERS_API}/roles`);
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

  getInterventionStatuses(cdNom?: number): Observable<any[]> {
    let params = new HttpParams();
    if (cdNom != null) {
      params = params.set('cd_nom', cdNom);
    }
    return this._http.get<any[]>(`${this.CLUSTERS_API}/intervention-status`, { params });
  }

  createIntervention(idCluster: number, data: Partial<Intervention>): Observable<Intervention> {
    return this._http.post<Intervention>(`${this.CLUSTERS_API}/${idCluster}/interventions/`, data);
  }

  updateIntervention(idCluster: number, idIntervention: number, data: Partial<Intervention>): Observable<Intervention> {
    return this._http.post<Intervention>(`${this.CLUSTERS_API}/${idCluster}/interventions/${idIntervention}`, data);
  }

  deleteIntervention(idCluster: number, idIntervention: number): Observable<void> {
    return this._http.delete<void>(`${this.CLUSTERS_API}/${idCluster}/interventions/${idIntervention}`);
  }
}
