import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SyntheseStoreService {
  public idSyntheseList: Set<number> = new Set();
  private pointData: Object = {};
  public selectCluster$ = new Subject<number>();

  constructor() {}

  public hasData(): boolean {
    return this.pointData && Object.keys(this.pointData).length > 0;
  }

  public getData(): Object {
    return this.pointData;
  }

  public setData(data: Object) {
    this.pointData = data;
  }

  public clearData() {
    this.idSyntheseList = new Set();
    this.pointData = {};
  }
}
