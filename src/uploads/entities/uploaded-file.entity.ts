import { Entity, PrimaryColumn, Column, CreateDateColumn, BeforeInsert } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

@Entity('uploaded_files')
export class UploadedFile {
  @PrimaryColumn('varchar', { length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = uuidv4();
  }

  @Column({ type: 'varchar', nullable: true })
  runId: string | null;

  @Column({ type: 'varchar', nullable: true })
  nodeId: string | null;

  @Column()
  filename: string;

  @Column()
  storagePath: string;

  @Column({ type: 'varchar', nullable: true })
  uploadedBy: string | null;

  @CreateDateColumn()
  uploadedAt: Date;
}
