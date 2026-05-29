import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { leafletDrawOption } from '@geonature_common/map/leaflet-draw.options';
import { MapService } from '@geonature_common/map/map.service';
import { ClustersFormMapService } from './clusters-form-map.service';
import { ConfigService } from '@geonature/services/config.service';

@Component({
  selector: 'pnx-clusters-form-map',
  templateUrl: 'clusters-form-map.component.html',
})
export class ClustersFormMapComponent implements OnInit, AfterViewInit, OnDestroy {
  public leafletDrawOptions: any;

  constructor(
    public ms: ClustersFormMapService,
    private _mapService: MapService,
    public config: ConfigService
  ) {}

  ngOnInit() {
    leafletDrawOption.draw.circle = false;
    leafletDrawOption.draw.rectangle = true;
    leafletDrawOption.draw.marker = false;
    leafletDrawOption.draw.polyline = false;
    leafletDrawOption.draw.polygon = true;
    leafletDrawOption.edit.remove = false;
    this.leafletDrawOptions = leafletDrawOption;
  }

  ngAfterViewInit() {
    if (this._mapService.currentExtend) {
      this._mapService.map.setView(
        this._mapService.currentExtend.center,
        this._mapService.currentExtend.zoom
      );
    }
  }

  ngOnDestroy() {
    this.ms.reset();
  }
}
