import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Cluster } from '../models';

@Component({
  selector: 'pnx-clusters-associate-modal',
  template: `
    <div class="modal-header">
      <h4 class="modal-title">Associer à un foyer</h4>
      <button type="button" class="close" (click)="activeModal.dismiss()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Sélectionner un foyer</label>
        <select class="form-control" [(ngModel)]="selectedClusterId">
          <option [ngValue]="null">Aucun</option>
          <option *ngFor="let c of clusters" [ngValue]="c.id">
            {{ c.name }}
          </option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" (click)="activeModal.dismiss()">Annuler</button>
      <button type="button" class="btn btn-primary" (click)="confirm()">
        Associer
      </button>
    </div>
  `,
})
export class ClustersAssociateModalComponent implements OnInit {
  @Input() clusters: Cluster[] = [];
  @Input() currentClusterId: number | null = null;
  selectedClusterId: number | null = null;
  observationIds: number[] = [];

  constructor(public activeModal: NgbActiveModal) {}

  ngOnInit() {
    this.selectedClusterId = this.currentClusterId;
  }

  confirm() {
    this.activeModal.close({ clusterId: this.selectedClusterId, obsIds: this.observationIds });
  }
}
