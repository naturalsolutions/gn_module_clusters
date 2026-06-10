import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Cluster, formatSurface, getManagerName, getTaxonName } from '../models';
import { ClustersDataService } from '../services/clusters-data.service';

@Component({
  selector: 'pnx-clusters-info-modal',
  template: `
    <div class="modal-header">
      <h4 class="modal-title">{{ cluster.name }}</h4>
      <button type="button" class="close" (click)="activeModal.dismiss()">&times;</button>
    </div>
    <div class="modal-body">
      <ng-container *ngIf="!loading; else loadingTpl">
        <dl class="row mb-0">
          <dt class="col-sm-5">Taxon</dt>
          <dd class="col-sm-7">{{ getTaxonName(cluster) }}</dd>

          <dt class="col-sm-5">Statut</dt>
          <dd class="col-sm-7">{{ cluster.status?.label_default || cluster.status?.mnemonique || '-' }}</dd>

          <dt class="col-sm-5">État</dt>
          <dd class="col-sm-7">{{ cluster.yearly_state?.label_default || cluster.yearly_state?.mnemonique || '-' }}</dd>

          <dt class="col-sm-5">Surface</dt>
          <dd class="col-sm-7">{{ formatSurface(cluster.surface) }}</dd>

          <dt class="col-sm-5">Observations</dt>
          <dd class="col-sm-7">{{ cluster.observations_count ?? '-' }}</dd>

          <dt class="col-sm-5">Gestionnaire</dt>
          <dd class="col-sm-7">{{ getManagerName(cluster) }}</dd>

          <dt class="col-sm-5">Date de création</dt>
          <dd class="col-sm-7">{{ (cluster.created_on | date:'dd/MM/yyyy') || '-' }}</dd>

          <dt class="col-sm-5">Notes</dt>
          <dd class="col-sm-7">{{ cluster.notes || '-' }}</dd>
        </dl>
      </ng-container>
      <ng-template #loadingTpl>
        <div class="text-center py-3">
          <div class="spinner-border" role="status">
            <span class="sr-only">Chargement...</span>
          </div>
        </div>
      </ng-template>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-outline-primary" (click)="edit()">Modifier</button>
      <button type="button" class="btn btn-secondary" (click)="activeModal.dismiss()">Fermer</button>
    </div>
  `,
})
export class ClustersInfoModalComponent implements OnInit {
  @Input() cluster: Cluster;
  loading = true;

  constructor(
    public activeModal: NgbActiveModal,
    private clustersDataService: ClustersDataService
  ) { }

  ngOnInit() {
    if (this.cluster?.id) {
      this.clustersDataService.getCluster(this.cluster.id).subscribe((feature) => {
        this.cluster = feature.properties as Cluster;
        this.loading = false;
      });
    } else {
      this.loading = false;
    }
  }

  getTaxonName(cluster: Cluster): string {
    return getTaxonName(cluster);
  }

  formatSurface(surface: number | null | undefined): string {
    return formatSurface(surface);
  }

  getManagerName(cluster: Cluster): string {
    return getManagerName(cluster);
  }

  edit() {
    this.activeModal.close(this.cluster);
  }
}
