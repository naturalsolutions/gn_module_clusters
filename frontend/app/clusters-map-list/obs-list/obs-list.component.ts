import { Component, Input, Output, EventEmitter, ViewChild, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { DatatableComponent } from '@swimlane/ngx-datatable';
import { Cluster } from '../../models';

@Component({
  selector: 'pnx-obs-list',
  templateUrl: 'obs-list.component.html',
  styleUrls: ['obs-list.component.scss'],
})
export class ObsListComponent implements OnChanges {
  @Input() observations: any[] = [];
  @Input() clusters: Cluster[] = [];
  @Input() selectedObsIds: Set<number> = new Set();
  @Input() selectedObsRowId: number | null = null;
  @Input() visible: boolean = false;
  @Input() canUpdateCluster: boolean = false;

  @Output() taxonClick = new EventEmitter<number>();
  @Output() associateObservations = new EventEmitter<number[]>();
  @Output() openInfoObs = new EventEmitter<number>();
  @Output() selectObsOnMap = new EventEmitter<number>();
  @Output() selectedIdsChange = new EventEmitter<number[]>();

  @ViewChild('table', { static: true }) table: DatatableComponent;

  selectedIds: Set<number> = new Set();
  rowNumber: number;

  constructor() {
    this.setRowNumber();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.rowNumber = Math.trunc(event.target.innerHeight / 37);
  }

  private setRowNumber() {
    this.rowNumber = Math.trunc(document.documentElement.clientHeight * 0.86 / 37);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']?.currentValue === true) {
      setTimeout(() => this.table.recalculate(), 0);
    }
    if (changes['observations']) {
      this.table.offset = 0;
    }
  }

  get selectedRows(): any[] {
    const selected = new Set<number>();
    if (this.selectedObsIds?.size > 0) {
      for (const id of this.selectedObsIds) {
        selected.add(id);
      }
    }
    if (this.selectedObsRowId != null) {
      selected.add(this.selectedObsRowId);
    }
    return this.observations.filter((o) => selected.has(o.id_synthese));
  }

  getRowClass(): string {
    return 'row-sm clickable';
  }

  toggleSelection(id: number) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.selectedIdsChange.emit(this.getSelectedIds());
  }

  toggleAll() {
    if (this.selectedIds.size === this.observations.length) {
      this.selectedIds.clear();
    } else {
      this.selectedIds = new Set(this.observations.map((o) => o.id_synthese));
    }
    this.selectedIdsChange.emit(this.getSelectedIds());
  }

  isSelected(id: number): boolean {
    return this.selectedIds.has(id);
  }

  isAllSelected(): boolean {
    return this.observations.length > 0 && this.selectedIds.size === this.observations.length;
  }

  getSelectedIds(): number[] {
    return Array.from(this.selectedIds);
  }

  onAssociate(obsId: number) {
    this.associateObservations.emit([obsId]);
  }

  onBulkAssociate() {
    if (this.selectedIds.size > 0) {
      this.associateObservations.emit(this.getSelectedIds());
    }
  }

  onInfoObs(obsId: number) {
    this.openInfoObs.emit(obsId);
  }

  onRowActivate(event: any) {
    if (event.type === 'click') {
      this.selectObsOnMap.emit(event.row.id_synthese);
    }
  }

  getCluster(clusterId: number): Cluster | undefined {
    if (clusterId == null) return undefined;
    return this.clusters.find((c) => c.id === clusterId);
  }

  getClusterName(clusterId: number): string {
    if (clusterId == null) return '';
    const cluster = this.clusters.find((c) => c.id === clusterId);
    return cluster ? cluster.name : '';
  }

  padDate(s: any): string {
    if (s == null) return '';
    const d = new Date(s);
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return [pad(d.getDate()), pad(d.getMonth() + 1), d.getFullYear()].join('-');
  }
}
