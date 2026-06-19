import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigService } from '@geonature/services/config.service';
import { ModuleService } from '@geonature/services/module.service';
import { ClustersStoreService } from '../services/store.service';
import { ClustersDataService } from '../services/clusters-data.service';
import { ClustersInfoModalComponent } from './clusters-info-modal.component';

@Component({
  selector: 'pnx-clusters-info-modal-wrapper',
  template: '',
})
export class ClustersInfoModalWrapperComponent implements OnDestroy {
  private destroy = new Subject<void>();
  private currentDialog: any = null;
  private moduleUrl: string;

  constructor(
    private modalService: NgbModal,
    private router: Router,
    private moduleService: ModuleService,
    private storeService: ClustersStoreService,
    private config: ConfigService,
    private clustersDataService: ClustersDataService,
    route: ActivatedRoute
  ) {
    this.moduleUrl = `/${this.moduleService.currentModule.module_path}`;

    const addObsModuleCode = this.config.CLUSTERS?.CREATE_OBS_MODULE;
    let addObsModulePath: string | null = null;
    if (addObsModuleCode) {
      const addObsModule = this.moduleService.getModule(addObsModuleCode);
      if (addObsModule) {
        addObsModulePath = addObsModule.module_path;
      }
    }

    route.params.pipe(takeUntil(this.destroy)).subscribe((params) => {
      const clusterId = +params.id_cluster;

      if (this.currentDialog) {
        return;
      }

      this.storeService.selectCluster$.next(clusterId);

      this.currentDialog = this.modalService.open(ClustersInfoModalComponent, {
        size: 'xl',
      });
      this.currentDialog.componentInstance.clusterId = clusterId;
      this.currentDialog.componentInstance.tab = params.tab || 'details';
      this.currentDialog.componentInstance.canAddObs = !!addObsModulePath;
      this.currentDialog.componentInstance.openObsId =
        Number(route.snapshot.queryParamMap.get('openObs')) || undefined;

      if (addObsModulePath) {
        this.currentDialog.componentInstance.onCreateObs = () => {
          this.currentDialog.dismiss('create-obs');
        };
      }

      this.currentDialog.result.then(
        (result) => {
          if (result === 'edit') {
            this.router.navigate([
              `/${this.moduleService.currentModule.module_path}/cluster`,
              clusterId,
              'edit',
            ]);
          } else {
            this.router.navigateByUrl(this.moduleUrl);
          }
        },
        (reason) => {
          if (reason === 'create-obs' && addObsModulePath) {
            const modal = this.currentDialog.componentInstance as ClustersInfoModalComponent;
            const redirectUrl = `${this.moduleUrl}/${clusterId}/associate-obs/{id_synthese}`;
            const queryParams: any = { redirect: redirectUrl };

            if (modal.cluster?.cd_nom) {
              queryParams.cd_nom = modal.cluster.cd_nom;
            }
            queryParams.geojson = this.clustersDataService.getClusterUrl(clusterId);

            this.router.navigate([`/${addObsModulePath}`], { queryParams });
          } else {
            this.router.navigateByUrl(this.moduleUrl);
          }
        }
      ).finally(() => {
        this.currentDialog = null;
      });
    });
  }

  ngOnDestroy(): void {
    this.destroy.next();
    this.destroy.complete();
    this.currentDialog?.close(-1);
  }
}
