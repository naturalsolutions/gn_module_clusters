import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { GN2CommonModule } from '@geonature_common/GN2Common.module';
import { ClustersMapListComponent } from './clusters-map-list/clusters-map-list.component';
import { ClustersListComponent } from './clusters-map-list/clusters-list/clusters-list.component';
import { ClustersCreateFormComponent } from './clusters-map-list/clusters-create-form/clusters-create-form.component';
import { ClustersObsMapComponent } from './clusters-map-list/clusters-obs-map/clusters-obs-map.component';
import { SyntheseFormService } from '@geonature_common/form/synthese-form/synthese-form.service';
import { MapService } from '@geonature_common/map/map.service';
import { TreeModule } from '@circlon/angular-tree-component';
import { DynamicFormService } from '@geonature_common/form/dynamic-form-generator/dynamic-form.service';
import { TaxonAdvancedStoreService } from '@geonature_common/form/synthese-form/advanced-form/synthese-advanced-form-store.service';
import { SharedSyntheseModule } from '@geonature/shared/syntheseSharedModule/synthese-shared.module';
import { SyntheseInfoObsComponent } from '@geonature/shared/syntheseSharedModule/synthese-info-obs/synthese-info-obs.component';

import { DiscussionCardComponent } from '@geonature/shared/discussionCardModule/discussion-card.component';
import { AlertInfoComponent } from '@geonature/shared/alertInfoModule/alert-Info.component';
import { NgbActiveModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { SyntheseObsModalWrapperComponent } from '@geonature/shared/syntheseSharedModule/synthese-info-obs-container.component';
import { TaxonSheetComponent } from '@geonature/syntheseModule/taxon-sheet/taxon-sheet.component';
import {
  TaxonSheetRouteService,
  ALL_TAXON_SHEET_ADVANCED_INFOS_ROUTES,
} from '@geonature/syntheseModule/taxon-sheet/taxon-sheet.route.service';
import {
  ALL_OBSERVERS_ADVANCED_INFOS_ROUTES,
  ObserverSheetRouteService,
} from '@geonature/syntheseModule/observer-sheet/observer-sheet.route.service';
import { ObserverSheetComponent } from '@geonature/syntheseModule/observer-sheet/observer-sheet.component';
import { ObserverSheetService } from '@geonature/syntheseModule/observer-sheet/observer-sheet.service';
import { ObservationsFiltersService } from '@geonature/syntheseModule/sheets/observations/observations-filters.service';
import { ConfigService } from '@geonature/services/config.service';
import { TranslateModule, TranslateLoader, TranslateService } from '@ngx-translate/core';
import { CustomTranslateLoader } from '@geonature/shared/translate/custom-loader';
import { I18nService } from '@geonature/shared/translate/i18n-service';
import { ObsListComponent } from './clusters-map-list/obs-list/obs-list.component';
import { ClustersAssociateModalComponent } from './clusters-associate-modal/clusters-associate-modal.component';
import { ClustersInfoModalComponent } from './clusters-info-modal/clusters-info-modal.component';
import { ClustersInfoModalWrapperComponent } from './clusters-info-modal/clusters-info-modal-wrapper.component';
import { ClustersDataService } from './services/clusters-data.service';

const routes: Routes = [
  {
    path: '',
    component: ClustersMapListComponent,
    children: [
      {
        path: 'occurrence/:id_synthese',
        redirectTo: 'occurrence/:id_synthese/details',
        pathMatch: 'full',
      },
      {
        path: 'occurrence/:id_synthese/:tab',
        component: SyntheseObsModalWrapperComponent,
        data: { useFrom: 'clusters' },
      },
      {
        path: 'cluster/:id_cluster',
        redirectTo: 'cluster/:id_cluster/details',
        pathMatch: 'full',
      },
      {
        path: 'cluster/:id_cluster/:tab',
        component: ClustersInfoModalWrapperComponent,
      },
    ],
  },
  {
    path: 'taxon/:cd_ref',
    component: TaxonSheetComponent,
    canActivate: [TaxonSheetRouteService],
    canActivateChild: [TaxonSheetRouteService],
    children: [
      ...ALL_TAXON_SHEET_ADVANCED_INFOS_ROUTES.map((tab) => {
        return {
          path: tab.path,
          component: tab.component,
        };
      }),
    ],
  },
  {
    path: 'observer/:observer',
    component: ObserverSheetComponent,
    canActivate: [ObserverSheetRouteService],
    canActivateChild: [ObserverSheetRouteService],
    children: [
      ...ALL_OBSERVERS_ADVANCED_INFOS_ROUTES.map((tab) => {
        return {
          path: tab.path,
          component: tab.component,
        };
      }),
    ],
  },
];

export function createTranslateLoader(http: HttpClient, config: ConfigService) {
  return new CustomTranslateLoader(http, config, { moduleName: 'clusters' });
}

@NgModule({
  imports: [
    RouterModule.forChild(routes),
    GN2CommonModule,
    SharedSyntheseModule,
    CommonModule,
    TreeModule,
    NgbModule,
    TranslateModule.forChild({
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient, ConfigService],
      },
      isolate: true,
    }),
  ],
  declarations: [
    ClustersMapListComponent,
    ClustersListComponent,
    ClustersCreateFormComponent,
    ClustersObsMapComponent,
    ObsListComponent,
    ClustersAssociateModalComponent,
    ClustersInfoModalComponent,
    ClustersInfoModalWrapperComponent,
    SyntheseObsModalWrapperComponent,
  ],
  entryComponents: [
    ClustersMapListComponent,
    SyntheseInfoObsComponent,
    ClustersAssociateModalComponent,
    ClustersInfoModalComponent,
    ClustersInfoModalWrapperComponent,
    DiscussionCardComponent,
    AlertInfoComponent,
    SyntheseObsModalWrapperComponent,
  ],
  providers: [
    MapService,
    DynamicFormService,
    TaxonAdvancedStoreService,
    SyntheseFormService,
    NgbActiveModal,
    ClustersDataService,
    ObservationsFiltersService,
    ObserverSheetService,
    ObserverSheetRouteService,
    TaxonSheetRouteService,
  ],
})
export class GeonatureModule {
  constructor(
    private translateService: TranslateService,
    private i18nService: I18nService
  ) {
    this.i18nService.initializeModuleTranslateService(this.translateService);
  }
}
