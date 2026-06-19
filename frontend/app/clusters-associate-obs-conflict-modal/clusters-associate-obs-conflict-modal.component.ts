import { Component } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'pnx-clusters-associate-obs-conflict-modal',
  template: `
    <div class="modal-header">
      <h4 class="modal-title">Observation en dehors du foyer</h4>
      <button type="button" class="close" aria-label="Close" (click)="activeModal.dismiss()">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
    <div class="modal-body">
      <p>
        L'observation que vous souhaitez associer n'est pas située dans l'emprise
        géographique du foyer.
      </p>
      <p>Que souhaitez-vous faire ?</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" (click)="skip()">
        Ne pas associer
      </button>
      <button type="button" class="btn btn-primary" (click)="extend()">
        Étendre le foyer pour inclure cette observation
      </button>
    </div>
  `,
})
export class ClustersAssociateObsConflictModalComponent {
  constructor(public activeModal: NgbActiveModal) {}

  skip() {
    this.activeModal.close('skip');
  }

  extend() {
    this.activeModal.close('extend');
  }
}
