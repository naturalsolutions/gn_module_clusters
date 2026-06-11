import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ModuleService } from '@geonature/services/module.service';
import { SyntheseStoreService } from '../services/store.service';
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
    private storeService: SyntheseStoreService,
    route: ActivatedRoute
  ) {
    this.moduleUrl = `/${this.moduleService.currentModule.module_path}`;

    route.params.pipe(takeUntil(this.destroy)).subscribe((params) => {
      this.storeService.selectCluster$.next(+params.id_cluster);

      this.currentDialog = this.modalService.open(ClustersInfoModalComponent, {
        size: 'lg',
      });
      this.currentDialog.componentInstance.clusterId = +params.id_cluster;

      this.currentDialog.result.then(
        () => {
          this.router.navigateByUrl(this.moduleUrl);
        },
        () => {
          this.router.navigateByUrl(this.moduleUrl);
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
