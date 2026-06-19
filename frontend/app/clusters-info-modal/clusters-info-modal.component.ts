import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgbActiveModal, NgbModal, NgbNavChangeEvent } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { SyntheseInfoObsComponent } from '@geonature/shared/syntheseSharedModule/synthese-info-obs/synthese-info-obs.component';
import { Cluster, Intervention, InterventionStatus, formatSurface, getManagerName, getTaxonName } from '../models';
import { ClustersDataService } from '../services/clusters-data.service';
import { ModuleService } from '@geonature/services/module.service';
import { saveAs } from 'file-saver';

@Component({
  selector: 'pnx-clusters-info-modal',
  templateUrl: './clusters-info-modal.component.html',
  styleUrls: ['./clusters-info-modal.component.scss'],
})
export class ClustersInfoModalComponent implements OnInit {
  @Input() clusterId: number;
  @Input() canAddObs = false;
  @Input() onCreateObs: () => void = () => { };
  @Input() tab = 'details';
  @Input() openObsId?: number;
  cluster: Cluster;
  loading = true;
  exporting = false;
  interventionStatuses: InterventionStatus[] = [];
  showForm = false;
  editingIntervention: Intervention | null = null;
  saving = false;
  formData: any = {};
  activeTab = 'details';

  constructor(
    public activeModal: NgbActiveModal,
    private modalService: NgbModal,
    private toastrService: ToastrService,
    private clustersDataService: ClustersDataService,
    private router: Router,
    private moduleService: ModuleService,
  ) { }

  ngOnInit() {
    this.activeTab = this.tab || 'details';
    if (this.clusterId) {
      this.clustersDataService.getCluster(this.clusterId).subscribe((feature) => {
        this.cluster = feature.properties as Cluster;
        this.loading = false;
        if (this.openObsId) {
          setTimeout(() => this.viewObs(this.openObsId));
        }
        this.clustersDataService
          .getInterventionStatuses(this.cluster.cd_nom)
          .subscribe((statuses) => {
            this.interventionStatuses = statuses;
          });
      });
    } else {
      this.loading = false;
    }
  }

  onNavChange(event: NgbNavChangeEvent) {
    const baseUrl = `/${this.moduleService.currentModule.module_path}`;
    this.router.navigate([`${baseUrl}/cluster/${this.clusterId}/info/${event.nextId}`], {
      replaceUrl: true,
    });
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
    this.activeModal.close('edit');
  }

  viewObs(idSynthese: number) {
    const modalRef = this.modalService.open(SyntheseInfoObsComponent, {
      size: 'lg',
      windowClass: 'large-modal',
    });
    modalRef.componentInstance.idSynthese = idSynthese;
    modalRef.componentInstance.selectedTab = 'details';
    modalRef.componentInstance.useFrom = 'clusters';
    modalRef.componentInstance.header = true;
  }

  exportPdf() {
    if (!this.cluster?.id) return;
    this.exporting = true;
    this.clustersDataService.exportPdf(this.cluster.id).subscribe({
      next: (blob) => {
        saveAs(blob, `foyer_${this.cluster.name}.pdf`);
        this.exporting = false;
      },
      error: () => {
        this.exporting = false;
      },
    });
  }

  showAddForm() {
    this.editingIntervention = null;
    this.formData = { operator_name: '', intervention_date: '', status_id: '', status_custom: '', notes: '' };
    this.showForm = true;
  }

  editIntervention(intervention: Intervention) {
    this.editingIntervention = intervention;
    this.formData = {
      operator_name: intervention.operator_name || intervention.operator?.nom_complet || '',
      intervention_date: intervention.intervention_date ? intervention.intervention_date.substring(0, 10) : '',
      status_id: intervention.status_id || null,
      status_custom: intervention.status_custom || '',
      notes: intervention.notes || '',
    };
    this.showForm = true;
  }

  deleteIntervention(intervention: Intervention) {
    if (!window.confirm(`Supprimer l'intervention #${intervention.id} ?`)) return;
    this.clustersDataService.deleteIntervention(this.cluster.id, intervention.id).subscribe({
      next: () => {
        this.toastrService.success('Intervention supprimée');
        this.cluster.interventions = this.cluster.interventions.filter(
          (i) => i.id !== intervention.id
        );
      },
    });
  }

  cancelForm() {
    this.showForm = false;
    this.editingIntervention = null;
  }

  saveIntervention() {
    this.saving = true;
    const data: any = {
      operator_name: this.formData.operator_name || null,
      intervention_date: this.formData.intervention_date ? `${this.formData.intervention_date}T12:00:00` : null,
      notes: this.formData.notes || null,
    };
    if (this.formData.status_id === null) {
      data.status_custom = this.formData.status_custom || null;
    } else {
      data.status_id = this.formData.status_id;
    }

    const request = this.editingIntervention
      ? this.clustersDataService.updateIntervention(this.cluster.id, this.editingIntervention.id, data)
      : this.clustersDataService.createIntervention(this.cluster.id, data);

    request.subscribe({
      next: (intervention) => {
        this.saving = false;
        this.showForm = false;
        this.editingIntervention = null;
        if (intervention) {
          const idx = this.cluster.interventions.findIndex((i) => i.id === intervention.id);
          if (idx >= 0) {
            this.cluster.interventions[idx] = intervention;
          } else {
            this.cluster.interventions.push(intervention);
          }
        }
      },
      error: () => {
        this.saving = false;
      },
    });
  }
}
