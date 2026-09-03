import { Pipe, PipeTransform } from '@angular/core';
@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  transform(value?: number): string {
    if (value === undefined) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value,
      index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index++;
    }
    return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
  }
}
