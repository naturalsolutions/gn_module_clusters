import { Injectable } from '@angular/core';
import {
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { CommonService } from '@geonature_common/service/common.service';
import { ClustersDataService } from '../../services/clusters-data.service';
import { ClustersFormMapService } from '../map/clusters-form-map.service';
import { ClustersFormService } from '../clusters-form.service';
import { ModuleService } from '@geonature/services/module.service';

@Injectable()
export class ClustersFormDetailService {
  public clusterForm: UntypedFormGroup;
  public waiting = false;

  constructor(
    private fb: UntypedFormBuilder,
    private _router: Router,
    private _commonService: CommonService,
    private _dataS: ClustersDataService,
    private clustersFormMapService: ClustersFormMapService,
    private clustersFormService: ClustersFormService,
    private _moduleService: ModuleService
  ) {
    this.clusterForm = this.fb.group({
      geometry: this.clustersFormMapService.geometry,
      properties: this.fb.group({
        name: [null, Validators.required],
        notes: null,
        cd_nom: [null, Validators.required],
        status_id: null,
        yearly_state_id: null,
      }),
    });
  }

  loadCluster(id: number) {
    this.clustersFormService.clusterData.next(null);
    this.clustersFormService.idCluster.next(id);
    this.clustersFormService.editionMode.next(true);
    this.clustersFormService.disabled = false;

    this._dataS.getCluster(id).subscribe(
      (feature) => {
        this.clustersFormService.clusterData.next(feature);
        const cluster = feature.properties as any;

        if (feature.geometry) {
          this.clustersFormMapService.setGeometryFromAPI(feature.geometry);
        }

        this.clusterForm.patchValue({
          properties: {
            name: cluster.name,
            notes: cluster.notes || null,
            cd_nom: cluster.taxref || { cd_nom: cluster.cd_nom },
            status_id: cluster.status_id,
            yearly_state_id: cluster.yearly_state_id,
          },
        });
      },
      () => {
        this._commonService.translateToaster('error', 'Erreur lors du chargement du foyer');
        this.clustersFormService.backToList();
      }
    );
  }

  clusterFormValue() {
    const value = JSON.parse(JSON.stringify(this.clusterForm.value));
    if (value.properties.cd_nom && typeof value.properties.cd_nom === 'object') {
      value.properties.cd_nom = value.properties.cd_nom.cd_nom;
    }
    return value;
  }

  submitCluster() {
    const modulePath = this._moduleService.currentModule.module_path;
    this.waiting = true;
    const value = this.clusterFormValue();

    if (this.clustersFormService.idCluster.getValue()) {
      this._dataS
        .updateCluster(this.clustersFormService.idCluster.getValue(), value)
        .subscribe(
          (data: any) => {
            this.waiting = false;
            this._commonService.translateToaster('info', 'Foyer modifié');
            this.clustersFormService.backToList();
          },
          (err) => {
            this.waiting = false;
            this._commonService.translateToaster('error', 'Erreur lors de la modification');
          }
        );
    } else {
      this._dataS.createCluster(value).subscribe(
        (data: any) => {
          this.waiting = false;
          this._commonService.translateToaster('info', 'Foyer créé');
          this.clustersFormService.backToList();
        },
        (err) => {
          this.waiting = false;
          this._commonService.translateToaster('error', 'Erreur lors de la création');
        }
      );
    }
  }

  reset() {
    this.clustersFormService.disabled = true;
  }
}
