import {
  Component,
  Prop,
  State,
  Element,
  Event,
  EventEmitter,
  Watch,
  h,
  Method,
} from '@stencil/core';
import { TranslationController } from '../../global/Translation';

import { renderHiddenField } from '../../utils';

let fileCount = 1;

@Component({
  tag: 'fw-file-uploader',
  styleUrl: 'file-uploader.scss',
  shadow: true,
})
export class FileUploader {
  @Element() host!: HTMLElement;

  /**
   * stage - different stages in file uploader.
   */
  @State() stage: 'dropzone' | 'files' | 'progress' = 'dropzone';

  /**
   * text - file uploader text.
   */
  // @i18n({ keyName: 'fileUploader.text' })
  @Prop({ mutable: true })
  text;

  /**
   * name - field name
   */
  @Prop() name = '';

  /**
   * description - file uploader description.
   */
  // @i18n({ keyName: 'fileUploader.description' })
  @Prop({ mutable: true })
  description;

  /**
   * hint - file uploader hint text.
   */
  @Prop() hint = '';

  /**
   * accept - comma separated string. tells us what file formats file uploader should accept.
   */
  @Prop() accept = '';

  /**
   * maxFileSize - maximum file size the file uploader must accept.
   */
  @Prop() maxFileSize = 0;

  /**
   * acceptError - Error message to display when format is invalid.
   */
  // @i18n({ keyName: 'fileUploader.acceptError' })
  @Prop({ mutable: true })
  acceptError;

  /**
   * maxFileSizeError - Error message to display when file size exceeds limit
   */
  // @i18n({ keyName: 'fileUploader.maxFileSizeError' })
  @Prop({ mutable: true })
  maxFileSizeError;

  /**
   * maxFilesLimitError - Error message when going beyond files limit.
   */
  // @i18n({ keyName: 'fileUploader.maxFilesLimitError' })
  @Prop({ mutable: true })
  maxFilesLimitError;

  /**
   * fileUploadError - Error message when a file upload fails.
   */
  // @i18n({ keyName: 'fileUploader.fileUploadError' })
  @Prop({ mutable: true })
  fileUploadError;

  /**
   * actionURL - URL to make server call.
   */
  @Prop() actionURL = '';

  /**
   * actionParams - additional information to send to server other than the file.
   */
  @Prop() actionParams: any = {};

  /**
   * multiple - upload multiple files.
   */
  @Prop() multiple = false;

  /**
   * Max files allowed to upload.
   */
  @Prop() filesLimit = 10;

  /**
   * modify request
   * @param xhr
   * @returns xhr
   */
  @Prop() modifyRequest: (xhr: any) => any = (xhr) => xhr;

  /**
   * files - files collection.
   */
  @State() files: any = [];

  /**
   * errors - errors collection.
   */
  @State() errors: any = [];

  /**
   * filesUploaded - event that gets emitted when files get uploaded
   */
  @Event() fwFilesUploaded: EventEmitter;

  /**
   * fileReuploaded - event that gets emitted when file is reuploaded
   */
  @Event() fwFileReuploaded: EventEmitter;

  /**
   * stageChanged - event that gets emitted when component stage changes
   */
  @Event() fwStageChanged: EventEmitter;

  /**
   * private
   * fileInputElement
   */
  fileInputElement: HTMLElement = null;

  /**
   * private
   * isFileUploadInProgress
   */
  isFileUploadInProgress = false;

  /**
   * private
   * fileUploadPromises
   */
  fileUploadPromises: any = [];

  /**
   * private
   * formDataCollection
   */
  formDataCollection: any = {};

  @Watch('stage')
  stageChange(newStage) {
    switch (newStage) {
      case 'dropzone':
        this.formDataCollection = {};
        this.fileUploadPromises = [];
        this.errors = [];
        this.files = [];
        break;
      default:
        break;
    }
    this.fwStageChanged.emit({ stage: newStage, files: this._getFiles() });
  }

  /**
   * private
   * uploadFileLocally - upload the files locally and add it to form for sending to server
   * @param file
   */
  uploadFileLocally(file) {
    const formData = new FormData();
    formData.append('file', file);
    this.formDataCollection[fileCount] = formData;
    this.files.push({
      id: fileCount,
      name: file.name,
      progress: 0,
      error: '',
    });
    fileCount = fileCount + 1;
  }

  /**
   * uploadFile
   * @param fileId
   * @returns fileUploadPromise
   */
  uploadFile(fileId) {
    const formData = this.formDataCollection[fileId];
    // adding extra information to formData before uploading
    for (const key in this.actionParams) {
      if (Object.prototype.hasOwnProperty.call(this.actionParams, key)) {
        formData.append(key, this.actionParams[key]);
      }
    }
    // creating and sending xhr requests
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener(
      'progress',
      this.progressHandler.bind(this, fileId),
      false
    );
    const fileUploadPromise = new Promise((resolve: any, reject: any) => {
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            resolve({ uploadStatus: xhr.status, response: xhr.response });
          } else {
            this.setFile(fileId, {
              error:
                this.fileUploadError ||
                TranslationController.t('fileUploader.fileUploadError'),
            });
            reject({ uploadStatus: xhr.status, response: xhr.response });
          }
        }
      };
    });
    xhr.open('POST', this.actionURL);
    const modifiedRequest = this.modifyRequest(xhr);
    modifiedRequest.send(formData);
    return fileUploadPromise;
  }

  /**
   * private
   * retryFileUpload retry a file upload
   * @param fileId
   */
  retryFileUpload(fileId) {
    this.setFile(fileId, { error: '' });
    const uploadPromise = this.uploadFile(fileId);
    this.fileUploadPromises = [uploadPromise];
    Promise.allSettled(this.fileUploadPromises).then((responses: any) => {
      this.fwFileReuploaded.emit(responses[0].value);
    });
  }

  _getFiles() {
    const data = new DataTransfer();
    this.files.forEach((file) => {
      data.items.add(this.formDataCollection[file.id].get('file'));
    });
    return data.files;
  }

  /**
   * get all locally available files in the component
   * @returns FileList of all locally available files in the component
   */
  @Method()
  async getFiles() {
    return this._getFiles();
  }

  /**
   * uploadFiles - uploads the files to the server. emits an after file is uploaded.
   */
  @Method()
  async uploadFiles() {
    if (this.files.length && !this.isFileUploadInProgress) {
      this.stage = 'progress';
      this.isFileUploadInProgress = true;
      for (const fileId in this.formDataCollection) {
        if (
          Object.prototype.hasOwnProperty.call(this.formDataCollection, fileId)
        ) {
          const uploadPromise = this.uploadFile(parseInt(fileId));
          this.fileUploadPromises.push(uploadPromise);
        }
      }
      Promise.allSettled(this.fileUploadPromises).then((responses: any) => {
        const responseValues = responses.map((response: any) => response.value);
        const responseValue = this.multiple
          ? responseValues
          : responseValues[0];
        this.fwFilesUploaded.emit(responseValue);
        this.isFileUploadInProgress = false;
      });
    }
  }

  /**
   * reset file uploader
   */
  @Method()
  async reset() {
    this.stage = 'dropzone';
  }

  /**
   * private
   * removeFile - remove a file from the form and files collection.
   * @param fileId
   */
  removeFile(fileId) {
    const fileIndex = this.files.findIndex((file) => file.id === fileId);
    if (fileIndex >= 0) {
      const beforeFiles = this.files.slice(0, fileIndex);
      const afterFiles = this.files.slice(fileIndex + 1, this.files.length + 1);
      this.files = [...beforeFiles, ...afterFiles];
      delete this.formDataCollection[fileId];
      if (!this.files.length) {
        this.stage = 'dropzone';
      }
    }
  }

  /**
   * private
   * fileValidation validate a file for upload
   * @param file
   * @returns
   */
  fileValidation(file) {
    let isPassed = true;
    const fileExtension = file.name;
    const fileSize = file.size;
    const errors: any = [];
    if (this.accept) {
      isPassed = this.accept
        .split(',')
        .filter((fileType) => fileType !== '')
        .some((fileType) => fileExtension.includes(fileType.trim()));
      if (!isPassed) {
        errors.push(
          this.acceptError ||
            TranslationController.t('fileUploader.acceptError')
        );
      }
    }
    if (this.maxFileSize !== 0) {
      if (fileSize > this.maxFileSize * 1024 * 1024) {
        isPassed = false;
        errors.push(
          this.maxFileSizeError ||
            TranslationController.t('fileUploader.maxFileSizeError')
        );
      }
    }
    this.errors = [...this.errors, ...errors];
    return isPassed;
  }

  /**
   * private
   * setFile - update the file object in files collection.
   */
  setFile(fileId: number, errorObject: any) {
    let change: boolean;
    const fileIndex = this.files.findIndex((file) => file.id === fileId);
    if (fileIndex >= 0) {
      this.files = [
        ...this.files.slice(0, fileIndex),
        Object.assign(this.files[fileIndex], errorObject),
        ...this.files.slice(fileIndex + 1, this.files.length),
      ];
      change = true;
    } else {
      change = false;
    }
    return change;
  }

  /**
   * private
   * drag and drop handler
   * @param event
   */
  dropHandler(event) {
    event.preventDefault();
    this.fileHandler(event);
  }

  /**
   * private
   * fileHandler - handler for both drop and input change
   * @param event
   */
  fileHandler(event) {
    let passed = true;
    const tempFiles = event.target.files || event.dataTransfer.files;
    const files = this.multiple ? tempFiles : [tempFiles[0]];
    this.errors = [];
    if (files.length <= this.filesLimit) {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        passed = this.fileValidation(file);
        if (!passed) {
          break;
        }
      }
    } else {
      this.errors = [
        this.maxFilesLimitError ||
          TranslationController.t('fileUploader.maxFilesLimitError'),
      ];
      passed = false;
    }
    if (passed) {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        this.uploadFileLocally(file);
        this.stage = 'files';
      }
    }
  }

  /**
   * private
   * progressHandler - update the progress on files
   * @param fileId
   * @param event
   */
  progressHandler(fileId, event) {
    const fileIndex = this.files.findIndex((file) => fileId === file.id);
    if (fileIndex >= 0) {
      const progressPercentage = (event.loaded / event.total) * 100;
      const file = { ...this.files[fileIndex], progress: progressPercentage };
      const beforeFiles = this.files.slice(0, fileIndex);
      const afterFiles = this.files.slice(fileIndex + 1, this.files.length + 1);
      this.files = [...beforeFiles, file, ...afterFiles];
    }
  }

  /**
   * renderFileUploader
   * @returns {JSX.Element}
   */
  renderFileUploader() {
    let template = null;
    switch (this.stage) {
      case 'dropzone':
        template = this.renderDropzone();
        break;
      case 'progress':
        template = this.renderProgress();
        break;
      case 'files':
        template = this.renderFiles();
        break;
      default:
        break;
    }
    return template;
  }

  /**
   * renderDropzone
   * @returns {JSX.Element}
   */
  renderDropzone() {
    return (
      <div
        class='dropzone'
        key='dropzone'
        tabIndex={0}
        onDrop={(event) => this.dropHandler(event)}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => this.fileInputElement.click()}
        onKeyUp={(event) => {
          if (event.key === 'Enter' || event.key === 'Space') {
            this.fileInputElement.click();
          }
        }}
        role='button'
      >
        <div class='dropzone-center'>
          <div class='drop-clickable'>
            <div class='drop-clickable-icon'>
              <svg
                width='32'
                height='32'
                viewBox='0 0 32 32'
                fill='none'
                xmlns='http://www.w3.org/2000/svg'
              >
                <rect width='32' height='32' fill='url(#pattern0)' />
                <defs>
                  <pattern
                    id='pattern0'
                    patternContentUnits='objectBoundingBox'
                    width='1'
                    height='1'
                  >
                    <use
                      xlinkHref='#image0_1441_50512'
                      transform='scale(0.00195312)'
                    />
                  </pattern>
                  <image
                    id='image0_1441_50512'
                    width='512'
                    height='512'
                    xlinkHref='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAgAElEQVR4Ae2dCZQd1X3mr0FsNl4wS7BNMhMmmcSemcQ2trENlnrTvjXOKHYmGds5QUIMqw3CAoHU2qXe5JjYWAHUMlJYvB2Pc8zkJG61QTJggbExZjFgVrMjIfWr1+p+Qr5z/q/fbT3ardZ9y626Vfenc+q0ENVVr7766vt+dWt5SvEHBVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVAABVwq0Namj1iwUR81rz069Zzu3KS53bn/07oh2tC6If+t1q7o387pjn41tzvax4QGeMDOA3O6on2fuy6/76bthW0b79NHuTx+WTYKoAAKVK1Aa/fAx87pjha1bohube2KdrZ25x9v7Y5ebu3O51q7o8HW7kgzoQEesPfAnM5If/4beX3rXYXC9T8auqrqg5NfRAEUQIF6KzC7s/+k1q7c+a3d0e2t3dHTrd1RnoC3D3i0QqvxPCAA8IVv5PX3du7X37yjsG9j774lSqm3lKZ6H84sDwVQAAUOr8C87r3vntvZv7i1O/pFa3e0d7wQ4/9RcnigOg8YAPjuzoK+5ScFvfmOwsANPxq4ogwCBAb4gwIogAIxKKD1W1q79v5da3d0f2t3NECwVxfs6IZuNh4oB4Cbf1LQMt10ZyG/eRsQEEPasQoUQAGjwMy1e05v7Y7+pbU7imzCi3koOTxQmwfGAgCBgK07CvtuumPgMqXUEWWjAeZQ5ScKoAAK1EmBtrYjWtv3TDmnO3qgtTs6QKjXFuroh362HjgUAJQgoNDTG106b968I4GAOmUdi0EBFBhR4C0NbX0T5nb0/31rd/SSbWgxHwWHB+rjgfEAoAgB24cObOrNXbhgwUZ5RJCbA0eii7+g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'
                  />
                </defs>
              </svg>
            </div>
            <div class='drop-clickable-text'>
              {this.text || TranslationController.t('fileUploader.text')}
            </div>
            <div class='drop-clickable-hint'>
              <span>
                {this.description ||
                  TranslationController.t('fileUploader.description')}
              </span>
            </div>
          </div>
          {this.errors.length ? (
            <div class='dropzone-error'>
              {this.errors.map((message: string) => (
                <span>{message}</span>
              ))}
            </div>
          ) : (
            <div class='dropzone-hint'>{this.hint}</div>
          )}
        </div>
      </div>
    );
  }

  /**
   * renderProgress
   * @returns {JSX.Element}
   */
  renderProgress() {
    return (
      <div class='progress' key='progress'>
        <div class='progress-center'>
          <div class='progress-title'>
            {TranslationController.t('fileUploader.uploading')}
          </div>
          {this.files.map((file) => (
            <fw-file-uploader-progress
              fileId={file.id}
              fileName={file.name}
              progress={file.progress}
              error={file.error}
              onFwRetryUpload={(event) =>
                this.retryFileUpload(event.detail.fileId)
              }
            ></fw-file-uploader-progress>
          ))}
        </div>
      </div>
    );
  }

  /**
   * renderFiles
   * @returns {JSX.Element}
   */
  renderFiles() {
    return (
      <div class='files' key='files'>
        <div class='files-center'>
          <div class='files-title'>
            {TranslationController.t('fileUploader.selectedFiles')}
          </div>
          {this.files.map((file) => (
            <fw-file-uploader-file
              fileId={file.id}
              name={file.name}
              onFwRemoveFile={(event) => {
                event.stopPropagation();
                this.removeFile(event.detail.fileId);
              }}
            ></fw-file-uploader-file>
          ))}
        </div>
      </div>
    );
  }

  /**
   * render
   * @returns {JSX.Element}
   */
  render() {
    const multipleFiles = this.multiple ? { multiple: true } : {};
    renderHiddenField(this.host, this.name, null, this._getFiles());
    return (
      <div class='file-uploader-container'>
        <input
          type='file'
          name={this.name}
          hidden
          {...multipleFiles}
          style={{ display: 'none' }}
          onChange={(ev) => this.fileHandler(ev)}
          ref={(el) => (this.fileInputElement = el)}
        ></input>
        {this.renderFileUploader()}
      </div>
    );
  }
}
