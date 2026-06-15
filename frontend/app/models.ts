import { Role } from '@geonature/userModule/services/form.service';
import { Taxon } from '@geonature_common/form/taxonomy/taxonomy.component';
import { Cruved } from '@geonature/modules/imports/models/cruved.model';

// API response shape
export interface Cluster {
  id?: number;
  name: string;
  notes?: string | null;
  cd_nom: number;
  taxref?: Taxon | null;
  geom?: GeoJSON.Geometry | null;
  geom_4326?: GeoJSON.Geometry | null;
  centroid?: GeoJSON.Point;
  status_id?: number | null;
  status?: any | null;
  yearly_state_id?: number | null;
  yearly_state?: any | null;
  manager?: Role;
  manager_id?: number;
  created_on?: string;
  observations_count?: number;
  interventions_count?: number;
  surface?: number;
  cruved?: Cruved;
  interventions?: Intervention[];
}

export interface InterventionStatus {
  id?: number;
  label: string;
  cd_nom: number;
}

export interface Intervention {
  id?: number;
  cluster_id?: number;
  requestor?: Role;
  requestor_id?: number;
  operator?: Role;
  operator_id?: number;
  operator_name?: string | null;
  request_date?: string;
  intervention_date?: string;
  status_id?: number | null;
  status?: any | null;
  status_custom?: string | null;
  notes?: string | null;
}

export function getTaxonName(cluster: Cluster): string {
  if (cluster.taxref) {
    return cluster.taxref.nom_vern || cluster.taxref.lb_nom;
  }
  return String(cluster.cd_nom);
}

export function formatSurface(surface: number | null | undefined): string {
  if (surface == null) return '-';
  const hectares = surface / 10000;  // m² to ha
  return `${hectares.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

export function getManagerName(cluster: Cluster): string {
  if (cluster.manager) {
    return cluster.manager.nom_complet || `${cluster.manager.prenom_role || ''} ${cluster.manager.nom_role || ''}`.trim();
  }
  return '';
}

// GeoJSON Feature sent as request payload
export interface ClusterFeature {
  geometry: GeoJSON.Geometry;
  properties: {
    name: string;
    notes?: string | null;
    cd_nom: number;
    status_id?: number | null;
    yearly_state_id?: number | null;
  };
}
