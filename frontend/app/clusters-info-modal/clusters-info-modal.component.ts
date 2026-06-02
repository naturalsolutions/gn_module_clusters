import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Cluster, getTaxonName } from '../models';

@Component({
  selector: 'pnx-clusters-info-modal',
  template: `
    <div class="modal-header">
      <h4 class="modal-title">{{ cluster.name }}</h4>
      <button type="button" class="close" (click)="activeModal.dismiss()">&times;</button>
    </div>
    <div class="modal-body">
      <dl class="row mb-0">
        <dt class="col-sm-5">Taxon</dt>
        <dd class="col-sm-7">{{ getTaxonName(cluster) }}</dd>

        <dt class="col-sm-5">Statut</dt>
        <dd class="col-sm-7">{{ cluster.status?.label_default || cluster.status?.mnemonique || '-' }}</dd>

        <dt class="col-sm-5">État</dt>
        <dd class="col-sm-7">{{ cluster.yearly_state?.label_default || cluster.yearly_state?.mnemonique || '-' }}</dd>

        <dt class="col-sm-5">Observations</dt>
        <dd class="col-sm-7">{{ cluster.observations_count ?? '-' }}</dd>

        <dt class="col-sm-5">Gestionnaire</dt>
        <dd class="col-sm-7">{{ cluster.manager?.nom_complet || (cluster.manager?.prenom_role + ' ' + cluster.manager?.nom_role) || '-' }}</dd>

        <dt class="col-sm-5">Date de création</dt>
        <dd class="col-sm-7">{{ (cluster.created_on | date:'dd/MM/yyyy') || '-' }}</dd>

        <dt class="col-sm-5">Notes</dt>
        <dd class="col-sm-7">{{ cluster.notes || '-' }}</dd>
      </dl>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-outline-primary" (click)="edit()">Modifier</button>
      <button type="button" class="btn btn-secondary" (click)="activeModal.dismiss()">Fermer</button>
    </div>
  `,
})
export class ClustersInfoModalComponent {
  @Input() cluster: Cluster;

  constructor(public activeModal: NgbActiveModal) {}

  getTaxonName(cluster: Cluster): string {
    return getTaxonName(cluster);
  }

  edit() {
    this.activeModal.close(this.cluster);
  }
}
