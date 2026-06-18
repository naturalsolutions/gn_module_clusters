import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigService } from '@geonature/services/config.service';
import { ModuleService } from '@geonature/services/module.service';
import { ClustersStoreService } from '../services/store.service';
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
      this.storeService.selectCluster$.next(clusterId);

      this.currentDialog = this.modalService.open(ClustersInfoModalComponent, {
        size: 'xl',
      });
      this.currentDialog.componentInstance.clusterId = clusterId;
      this.currentDialog.componentInstance.canAddObs = !!addObsModulePath;

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
            const redirectUrl = `${this.moduleUrl}/${clusterId}/associate-obs/{id_synthese}`;
            this.router.navigate([`/${addObsModulePath}`], {
              queryParams: { redirect: redirectUrl },
            });
          } else {
            this.router.navigateByUrl(this.moduleUrl);
          }
        }
      );
    });
  }

  ngOnDestroy(): void {
    this.destroy.next();
    this.destroy.complete();
    this.currentDialog?.close(-1);
  }
}
