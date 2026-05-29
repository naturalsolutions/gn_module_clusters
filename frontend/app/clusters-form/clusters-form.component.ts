import { Component, OnInit, OnDestroy, HostListener, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonService } from '@geonature_common/service/common.service';
import { MapService } from '@geonature_common/map/map.service';
import { ClustersFormService } from './clusters-form.service';
import { ClustersFormMapService } from './map/clusters-form-map.service';
import { ClustersFormDetailService } from './form/clusters-form-detail.service';
import { ModuleService } from '@geonature/services/module.service';

@Component({
  selector: 'pnx-clusters-form',
  templateUrl: 'clusters-form.component.html',
  styleUrls: ['clusters-form.component.scss'],
  providers: [
    ClustersFormService,
    ClustersFormMapService,
    ClustersFormDetailService,
  ],
})
export class ClustersFormComponent implements OnInit, AfterViewInit, OnDestroy {
  cardContentHeight: any;

  constructor(
    public clustersFormService: ClustersFormService,
    public clustersFormDetailService: ClustersFormDetailService,
    private _route: ActivatedRoute,
    private _router: Router,
    private _mapService: MapService,
    private _commonService: CommonService,
    public moduleService: ModuleService
  ) {}

  ngOnInit() {
    const id = this._route.snapshot.paramMap.get('id');
    if (id) {
      this.clustersFormDetailService.loadCluster(Number(id));
    }
  }

  ngAfterViewInit() {
    setTimeout(() => this.calcCardContentHeight(), 500);
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.calcCardContentHeight();
  }

  calcCardContentHeight() {
    this.cardContentHeight = this._commonService.calcCardContentHeight(20);
    if (this._mapService.map) {
      setTimeout(() => {
        this._mapService.map.invalidateSize();
      }, 10);
    }
  }

  leaveTheForm(cancel: boolean) {
    if (this.clustersFormDetailService.clusterForm.dirty) {
      if (confirm('Êtes-vous sûr de vouloir fermer le formulaire ? Des modifications non sauvegardées seront perdues.')) {
        this.clustersFormService.backToList();
      }
    } else {
      this.clustersFormService.backToList();
    }
  }

  ngOnDestroy() {}
}
