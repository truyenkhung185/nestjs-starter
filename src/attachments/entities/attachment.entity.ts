import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AttachmentAccess {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

@Entity('attachments')
@Index(['attachableType', 'attachableId'])
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_type', type: 'varchar', length: 100 })
  fileType: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

  @Column({ name: 'storage_path', type: 'varchar', length: 500 })
  storagePath: string;

  @Column({ name: 'url', type: 'varchar', length: 500 })
  url: string;

  @Column({
    name: 'access_type',
    type: 'enum',
    enum: AttachmentAccess,
    default: AttachmentAccess.PUBLIC,
  })
  accessType: AttachmentAccess;

  @Column({ name: 'attachable_type', type: 'varchar', length: 100 })
  attachableType: string;

  @Column({ name: 'attachable_id', type: 'uuid' })
  attachableId: string;

  @Column({ name: 'uploader_id', type: 'uuid', nullable: true })
  uploaderId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
