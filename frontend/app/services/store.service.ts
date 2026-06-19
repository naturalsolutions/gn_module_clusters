import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ClustersStoreService {
  public idSyntheseList: Set<number> = new Set();
  private syntheseData: Object = {};
  public selectCluster$ = new Subject<number>();
  public clusterUpdated$ = new Subject<GeoJSON.Feature>();

  constructor() {}

  public hasSyntheseData(): boolean {
    return this.syntheseData && Object.keys(this.syntheseData).length > 0;
  }

  public getSyntheseData(): Object {
    return this.syntheseData;
  }

  public setSyntheseData(data: Object) {
    this.syntheseData = data;
  }

  public clearSyntheseData() {
    this.idSyntheseList = new Set();
    this.syntheseData = {};
  }
}
