import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ModuleService } from '@geonature/services/module.service';
import { MyCustomInterceptor } from '@geonature/services/http.interceptor';
import { ClustersStoreService } from '../services/store.service';
import { ClustersDataService } from '../services/clusters-data.service';
import { ClustersAssociateObsConflictModalComponent } from '../clusters-associate-obs-conflict-modal/clusters-associate-obs-conflict-modal.component';

@Component({
  template: '',
})
export class ClustersAssociateObsComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clustersDataService: ClustersDataService,
    private toasterService: ToastrService,
    private moduleService: ModuleService,
    private modalService: NgbModal,
    private geoErrorHandler: MyCustomInterceptor,
    private clusterStore: ClustersStoreService,
  ) {}

  ngOnInit() {
    const idCluster = Number(this.route.snapshot.paramMap.get('id_cluster'));
    const idSynthese = Number(this.route.snapshot.paramMap.get('id_synthese'));
    const baseUrl = `/${this.moduleService.currentModule.module_path}`;
    const clusterUrl = `${baseUrl}/cluster/${idCluster}/info/observations`;
    const obsUrl = `${baseUrl}/occurrence/${idSynthese}/details`;

    this.addObservation(idCluster, idSynthese, clusterUrl, obsUrl, baseUrl);
  }

  private addObservation(
    idCluster: number,
    idSynthese: number,
    clusterUrl: string,
    obsUrl: string,
    moduleUrl: string,
    extendsCluster?: boolean,
  ) {
    const options = extendsCluster ? { extendsCluster: true } : undefined;

    this.clustersDataService.addObservation(idCluster, idSynthese, options).subscribe({
      next: (feature) => {
        this.clusterStore.clusterUpdated$.next(feature);
        this.toasterService.success('Observation associée au foyer');
        this.router.navigateByUrl(`${clusterUrl}?openObs=${idSynthese}`);
      },
      error: (error) => {
        if (error.status === 409 && error.error?.reason === 'obs_outside_cluster_geom') {
          const modalRef = this.modalService.open(ClustersAssociateObsConflictModalComponent);
          modalRef.result.then(
            (result) => {
              if (result === 'extend') {
                this.addObservation(idCluster, idSynthese, clusterUrl, obsUrl, moduleUrl, true);
              } else {
                this.router.navigateByUrl(moduleUrl, { replaceUrl: true }).then(() =>
                  this.router.navigateByUrl(obsUrl)
                );
              }
            },
            () => {
              this.router.navigateByUrl(moduleUrl, { replaceUrl: true }).then(() =>
                this.router.navigateByUrl(obsUrl)
              );
            },
          );
        } else {
          this.geoErrorHandler.handleError(error);
          this.router.navigateByUrl(clusterUrl);
        }
      },
    });
  }
}
