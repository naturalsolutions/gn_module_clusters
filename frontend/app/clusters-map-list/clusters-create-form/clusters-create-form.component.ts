import { Component, Input, Output, EventEmitter } from '@angular/core';
import { UntypedFormGroup } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'pnx-clusters-create-form',
  templateUrl: 'clusters-create-form.component.html',
  styleUrls: ['clusters-create-form.component.scss'],
  animations: [
    trigger('slideUp', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('200ms ease-out', style({ transform: 'translateY(0)', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 })),
      ]),
    ]),
  ],
  host: { '[@slideUp]': '' },
})
export class ClustersCreateFormComponent {
  @Input() creationForm: UntypedFormGroup;
  @Input() waiting = false;
  @Input() isEditing = false;
  @Input() users: any[] = [];
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  get propertiesForm(): UntypedFormGroup {
    return this.creationForm?.get('properties') as UntypedFormGroup;
  }
}
