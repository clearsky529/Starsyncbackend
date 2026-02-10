import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Project } from './project.entity';

@Entity('pattern_comments')
export class PatternComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  patternName: string; // Pattern name/ID

  @Column()
  userId: string;

  @Column('text')
  commentText: string;

  @Column({ type: 'int', nullable: true })
  track: number | null; // Track index where pattern is placed

  @Column({ type: 'float', nullable: true })
  startBar: number | null; // Start position in bars

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'projectId' })
  project: Project;
}

