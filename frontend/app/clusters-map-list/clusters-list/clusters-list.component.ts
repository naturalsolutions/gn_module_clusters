import { Component, OnInit, Input, Output, EventEmitter, ViewChild, OnChanges, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { DatatableComponent } from '@swimlane/ngx-datatable';
import { Cluster, getTaxonName } from '../../models';
import { ModuleService } from '@geonature/services/module.service';

@Component({
  selector: 'pnx-clusters-list',
  templateUrl: 'clusters-list.component.html',
  styleUrls: ['clusters-list.component.scss'],
})
export class ClustersListComponent implements OnInit, OnChanges {
  @Input() clusters: Cluster[] = [];
  @Input() selectedClusterId: number | null = null;
  @Input() visible: boolean = false;
  @Input() clusterFilter: null | number[] = [];
  @Output() clusterFilterChange = new EventEmitter<null | number[]>();
  @Output() clusterClick = new EventEmitter<Cluster>();
  @Output() taxonClick = new EventEmitter<Cluster>();
  @ViewChild('table', { static: true }) table: DatatableComponent;

  constructor(
    private router: Router,
    private moduleService: ModuleService
  ) {}

  ngOnInit() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']?.currentValue === true) {
      setTimeout(() => this.table.recalculate(), 0);
    }
  }

  getTaxonName(cluster: Cluster): string {
    return getTaxonName(cluster);
  }

  onTaxonClick(cluster: Cluster) {
    this.taxonClick.emit(cluster);
  }

  onEdit(cluster: Cluster) {
    const modulePath = this.moduleService.currentModule.module_path;
    this.router.navigate([`${modulePath}/form`, cluster.id]);
  }

  onRowClick(event: any) {
    if (event.type !== 'click') return;
    this.clusterClick.emit(event.row);
  }

  getRowClass() {
    return 'row-sm clickable';
  }

  get selectedRows(): Cluster[] {
    if (this.selectedClusterId == null) return [];
    const match = this.clusters.find((c) => c.id === this.selectedClusterId);
    return match ? [match] : [];
  }

  isClusterInFilter(clusterId: number): boolean {
    return this.clusterFilter === null || this.clusterFilter.includes(clusterId);
  }

  toggleClusterFilter(clusterId: number) {
    if (this.clusterFilter === null) {
      this.clusterFilterChange.emit([clusterId]);
    } else if (this.clusterFilter.includes(clusterId)) {
      this.clusterFilterChange.emit(this.clusterFilter.filter((id) => id !== clusterId));
    } else {
      this.clusterFilterChange.emit([...this.clusterFilter, clusterId]);
    }
  }

  getDate(date) {
    if (!date) return '';
    function pad(s) {
      return s < 10 ? '0' + s : s;
    }
    const d = new Date(date);
    return [pad(d.getDate()), pad(d.getMonth() + 1), d.getFullYear()].join('-');
  }
}
