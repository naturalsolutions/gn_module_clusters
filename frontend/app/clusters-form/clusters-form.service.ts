import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { ClustersDataService } from '../services/clusters-data.service';
import { CommonService } from '@geonature_common/service/common.service';
import { ModuleService } from '@geonature/services/module.service';

@Injectable()
export class ClustersFormService {
  public idCluster: BehaviorSubject<number | null> = new BehaviorSubject(null);
  public clusterData: BehaviorSubject<any> = new BehaviorSubject(null);
  public disabled = true;
  public editionMode: BehaviorSubject<boolean> = new BehaviorSubject(false);

  constructor(
    private _router: Router,
    private _dataS: ClustersDataService,
    private _commonService: CommonService,
    private _moduleService: ModuleService
  ) {}

  onEditCluster(id: number) {
    this._router.navigate([`${this._moduleService.currentModule.module_path}/form`, id]);
  }

  backToList() {
    this._router.navigate([`${this._moduleService.currentModule.module_path}`]);
  }
}
