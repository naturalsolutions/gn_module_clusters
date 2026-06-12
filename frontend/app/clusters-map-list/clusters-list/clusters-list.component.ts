import { Component, OnInit, Input, Output, EventEmitter, ViewChild, OnChanges, SimpleChanges } from '@angular/core';
import { DatatableComponent } from '@swimlane/ngx-datatable';
import { Cluster, getTaxonName } from '../../models';
import { ClustersDataService } from '../../services/clusters-data.service';
import { saveAs } from 'file-saver';

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
  @Output() editCluster = new EventEmitter<Cluster>();
  @Output() infoCluster = new EventEmitter<Cluster>();
  @Output() deleteCluster = new EventEmitter<Cluster>();
  @ViewChild('table', { static: true }) table: DatatableComponent;

  constructor(
    private clustersDataService: ClustersDataService
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
    this.editCluster.emit(cluster);
  }

  onInfo(cluster: Cluster) {
    this.infoCluster.emit(cluster);
  }

  onDelete(cluster: Cluster) {
    this.deleteCluster.emit(cluster);
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

  exportPdf(cluster: Cluster) {
    if (!cluster.id) return;
    (cluster as any)._exporting = true;
    this.clustersDataService.exportPdf(cluster.id).subscribe({
      next: (blob) => {
        saveAs(blob, `foyer_${cluster.name}.pdf`);
        (cluster as any)._exporting = false;
      },
      error: () => {
        (cluster as any)._exporting = false;
      },
    });
  }
}
