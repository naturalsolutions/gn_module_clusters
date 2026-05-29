import { Injectable, OnDestroy } from '@angular/core';
import { UntypedFormControl, Validators } from '@angular/forms';
import { isEqual } from 'lodash';
import { BehaviorSubject, Subscription } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';
import { MapService } from '@geonature_common/map/map.service';
import { ClustersFormService } from '../clusters-form.service';

@Injectable()
export class ClustersFormMapService implements OnDestroy {
  private _geometry: UntypedFormControl;
  public geojson: BehaviorSubject<any> = new BehaviorSubject(null);
  public markerCoordinates;
  public leafletDrawGeoJson;
  private _subscription: Subscription;

  get geometry() {
    return this._geometry;
  }

  constructor(
    private clustersFormService: ClustersFormService,
    private _mapService: MapService
  ) {
    this.initForm();
    this.setObservables();
  }

  initForm(): void {
    this._geometry = new UntypedFormControl(null, Validators.required);
  }

  private setObservables() {
    this._subscription = this._mapService.gettingGeojson$
      .pipe(
        distinctUntilChanged(),
        filter((geojson) => geojson !== null)
      )
      .subscribe((geojson) => {
        this.setGeometryFromMap(geojson);
      });
  }

  ngOnDestroy() {
    if (this._subscription) {
      this._subscription.unsubscribe();
    }
  }

  setGeometryFromMap(geojson) {
    this.manageGeometryChange(geojson.geometry);
  }

  setGeometryFromAPI(geojson) {
    this.manageGeometryChange(geojson);
    if (geojson.type === 'Point') {
      this.markerCoordinates = geojson.coordinates;
      this.leafletDrawGeoJson = geojson;
    } else {
      this.leafletDrawGeoJson = geojson;
    }
  }

  manageGeometryChange(geojson) {
    if (!isEqual(geojson, this._geometry.value)) {
      this._geometry.setValue(geojson);
      this._geometry.markAsDirty();
      this.clustersFormService.disabled = false;
    }
  }

  reset() {
    this._geometry.setValue(null);
    this._geometry.updateValueAndValidity();
  }
}
