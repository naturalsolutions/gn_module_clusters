import { Component, OnInit, OnDestroy } from '@angular/core';
import { UntypedFormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ClustersFormService } from '../clusters-form.service';
import { ClustersFormDetailService } from './clusters-form-detail.service';
import { ModuleService } from '@geonature/services/module.service';

@Component({
  selector: 'pnx-clusters-form-detail',
  templateUrl: 'clusters-form-detail.component.html',
  styleUrls: ['clusters-form-detail.component.scss'],
})
export class ClustersFormDetailComponent implements OnInit, OnDestroy {
  public clusterForm: UntypedFormGroup;
  private _subscriptions: Subscription[] = [];

  constructor(
    public clustersFormService: ClustersFormService,
    public clustersFormDetailService: ClustersFormDetailService,
    public moduleService: ModuleService
  ) {}

  ngOnInit() {
    this.clusterForm = this.clustersFormDetailService.clusterForm;
  }

  get propertiesForm() {
    return this.clusterForm.get('properties');
  }

  submitClusterForm() {
    if (this.clusterForm.valid) {
      this.clustersFormDetailService.submitCluster();
    }
  }

  ngOnDestroy() {
    this.clustersFormDetailService.reset();
    this._subscriptions.forEach((s) => s.unsubscribe());
  }
}
