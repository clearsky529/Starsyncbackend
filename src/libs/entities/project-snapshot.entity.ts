import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('project_snapshot')
export class ProjectSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column('text')
  snapshotData: string; // JSON string of project content

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null; // Optional description for the snapshot

  @Column()
  createdBy: string; // User ID who created the snapshot

  @CreateDateColumn()
  created_at: Date;
}

