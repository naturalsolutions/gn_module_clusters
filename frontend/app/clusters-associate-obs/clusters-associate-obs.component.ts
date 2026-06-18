import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ModuleService } from '@geonature/services/module.service';
import { ClustersDataService } from '../services/clusters-data.service';

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
  ) {}

  ngOnInit() {
    const idCluster = Number(this.route.snapshot.paramMap.get('id_cluster'));
    const idSynthese = Number(this.route.snapshot.paramMap.get('id_synthese'));

    const baseUrl = `/${this.moduleService.currentModule.module_path}`;

    const clusterUrl = `${baseUrl}/cluster/${idCluster}/details`;

    this.clustersDataService.addObservation(idCluster, idSynthese).subscribe({
      next: () => {
        this.toasterService.success('Observation associée au foyer');
        this.router.navigateByUrl(clusterUrl);
      },
      error: () => {
        this.router.navigateByUrl(clusterUrl);
      },
    });
  }
}
